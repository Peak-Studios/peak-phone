"""Regenerate legacy image aliases from the original vector icons. Requires cairosvg.
Run `node tools/export-ios-icons.mjs` first. This is a maintenance tool, not a runtime dependency.
"""
from pathlib import Path
import shutil
import cairosvg
root=Path(__file__).resolve().parents[1]/'web/public/images'
mapping={'calls':'calls','conversations':'messages','email':'mails','contacts':'contacts','gallery':'gallery','camera':'camera','documents':'documents','settings':'settings','details':'details','housing':'housing','y':'y','twatter':'y','wenmo':'wenmo','services':'services','emergencyservices':'services','vehicles':'vehicles','debt':'debt','crypto':'crypto','jobcenter':'jobcenter','bus':'busdriver','lumberjack':'lumberjack','employment':'employment','news':'news','binsbergen':'bin','calculator':'calculator','yellowpages':'yellowpages','doj':'doj','pinger':'pinger','tierup':'tierup','racing':'racing','time-trials':'time-trials','facetime':'facetime','guber':'guber'}
for filename,app in mapping.items():
 cairosvg.svg2png(url=str(root/'ios'/f'{app}.svg'),write_to=str(root/f'{filename}.png'),output_width=128,output_height=128)
for filename,app in {'peakify.svg':'peakify','y-app.svg':'y'}.items():shutil.copyfile(root/'ios'/f'{app}.svg',root/filename)
print(f'Updated {len(mapping)} PNGs and 2 SVG aliases.')
