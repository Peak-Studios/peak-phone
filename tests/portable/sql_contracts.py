"""Static contracts for shipped SQL files; NOT database/migration execution.

portable.sql is the base schema, social.sql is the separately supplied social
schema, and jobs/schema.sql belongs to the existing job service. Reading all
three here does not imply the runtime automatically imports all three.
"""
from pathlib import Path
import re
import json

R = Path(__file__).resolve().parents[2]
sources = ['sql/portable.sql', 'sql/social.sql', 'jobs/schema.sql']
tables = {}
counts = {}
for source in sources:
    sql = (R / source).read_text(encoding='utf-8')
    count = 0
    for match in re.finditer(r'CREATE TABLE IF NOT EXISTS\s+(`?\w+`?)\s*\((.*?)\)\s*ENGINE', sql, re.I | re.S):
        table = match[1].strip('`')
        columns = {
            col[1] for col in re.finditer(
                r'(?:^|,)\s*`?(\w+)`?\s+(?:VARCHAR|CHAR|INT|BIGINT|SMALLINT|TEXT|MEDIUMTEXT|LONGTEXT|TINYINT|DECIMAL|DOUBLE|FLOAT|BOOLEAN|DATETIME|TIMESTAMP|JSON|VARBINARY|BINARY|BLOB|LONGBLOB|ENUM)\b',
                match[2], re.I
            )
        }
        assert table not in tables, ('duplicate table definition', source, table)
        tables[table] = columns
        count += 1
    counts[source] = count
    assert not re.search(r'\b(?:DROP|TRUNCATE)\s+TABLE', sql, re.I), source
assert counts == {'sql/portable.sql': 44, 'sql/social.sql': 15, 'jobs/schema.sql': 3}, counts

# Some modules own runtime-created tables (CREATE TABLE IF NOT EXISTS in Lua).
for file in R.glob('server/*.lua'):
    for match in re.finditer(r'CREATE TABLE IF NOT EXISTS\s+(`?\w+`?)\s*\((.*?)\)\s*ENGINE', file.read_text(encoding='utf-8'), re.I | re.S):
        table = match[1].strip('`')
        tables.setdefault(table, {
            col[1] for col in re.finditer(
                r'(?:^|,)\s*`?(\w+)`?\s+(?:VARCHAR|CHAR|INT|BIGINT|SMALLINT|TEXT|MEDIUMTEXT|LONGTEXT|TINYINT|DECIMAL|DOUBLE|FLOAT|BOOLEAN|DATETIME|TIMESTAMP|JSON|VARBINARY|BINARY|BLOB|LONGBLOB|ENUM)\b',
                match[2], re.I)
        })

checked = []
external = []
for file in [*R.glob('bridge/*.lua'), *R.glob('server/*.lua'), *R.glob('jobs/*.lua')]:
    for match in re.finditer(r'INSERT(?:\s+IGNORE)?\s+INTO\s+`?(\w+)`?\s*\(([^)]+)\)', file.read_text(encoding='utf-8'), re.I):
        table = match[1]
        columns = [x.strip().strip('`') for x in match[2].split(',')]
        if table not in tables:
            external.append({'file': str(file.relative_to(R)), 'table': table})
            continue
        assert set(columns) <= tables[table], (file.name, table, set(columns) - tables[table])
        checked.append({'file': str(file.relative_to(R)), 'table': table, 'columns': columns})
assert not external, external

manifest = (R / 'fxmanifest.lua').read_text()
paths = re.findall(r"'([^']+\.(?:lua|js))'", manifest)
for path in paths:
    if path.startswith('@') or '*' in path:
        continue
    assert (R / path).is_file(), path
assert "'@oxmysql/lib/MySQL.lua'" in manifest and "'@ox_lib/init.lua'" in manifest
report = {
    'method': 'Static insert-column and manifest contracts against the three declared SQL files; no MySQL engine or migration execution',
    'sources': counts, 'tables': len(tables), 'insertStatementsChecked': len(checked),
    'manifestPathsChecked': len(paths), 'destructiveDDL': False, 'liveMySQL': False,
    'autoImportOfAllSchemasVerified': False, 'statements': checked
}
(R / 'artifacts/portable/sql-contract-results.json').parent.mkdir(parents=True,exist_ok=True);(R / 'artifacts/portable/sql-contract-results.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({key: value for key, value in report.items() if key != 'statements'}, indent=2))
