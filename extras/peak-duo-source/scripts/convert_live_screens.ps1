param([Parameter(Mandatory)][string]$CodeWalker)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
foreach($n in @('SharpDX.dll','SharpDX.Mathematics.dll','CodeWalker.Core.dll')) {
    [Reflection.Assembly]::LoadFrom((Join-Path $CodeWalker $n)) | Out-Null
}
$inputDir=Join-Path $root 'intermediates/live-screens'
$outputDir=[IO.Path]::GetFullPath((Join-Path $root '../../stream'))
$roundtrip=Join-Path $root 'evidence/live-screens-roundtrip'
[IO.Directory]::CreateDirectory($outputDir) | Out-Null
[IO.Directory]::CreateDirectory($roundtrip) | Out-Null
$records=@()
$names=@(1..16 | ForEach-Object { 'peak_duo_screen_body_{0:00}.ydr' -f $_; 'peak_duo_screen_leaf_{0:00}.ydr' -f $_ }) + @('peak_duo_live.ytd','peak_duo_live.ytyp')
foreach($name in $names) {
    $xml=[IO.File]::ReadAllText((Join-Path $inputDir "$name.xml"))
    switch([IO.Path]::GetExtension($name)) {
        '.ydr' { $asset=[CodeWalker.GameFiles.XmlYdr]::GetYdr($xml,(Join-Path $inputDir ([IO.Path]::GetFileNameWithoutExtension($name))));$bytes=$asset.Save();$loaded=[CodeWalker.GameFiles.YdrFile]::new() }
        '.ytd' { $asset=[CodeWalker.GameFiles.XmlYtd]::GetYtd($xml,(Join-Path $inputDir 'peak_duo_live'));$bytes=$asset.Save();$loaded=[CodeWalker.GameFiles.YtdFile]::new() }
        '.ytyp' { $doc=[xml]$xml;$bytes=[CodeWalker.GameFiles.XmlMeta]::GetRSCData($doc);$loaded=[CodeWalker.GameFiles.YtypFile]::new() }
    }
    if(!$bytes -or $bytes.Length -lt 32 -or [Text.Encoding]::ASCII.GetString($bytes,0,4) -ne 'RSC7'){throw "Invalid binary: $name"}
    $dest=Join-Path $outputDir $name
    [IO.File]::WriteAllBytes($dest,$bytes)
    $loaded.Load([IO.File]::ReadAllBytes($dest))
    $rxml=switch([IO.Path]::GetExtension($name)) {
        '.ydr' {[CodeWalker.GameFiles.YdrXml]::GetXml($loaded,$roundtrip)}
        '.ytd' {[CodeWalker.GameFiles.YtdXml]::GetXml($loaded,$roundtrip)}
        '.ytyp' {$fname='';[CodeWalker.GameFiles.MetaXml]::GetXml($loaded,[ref]$fname)}
    }
    if(!$rxml){throw "Roundtrip empty: $name"}
    [IO.File]::WriteAllText((Join-Path $roundtrip "$name.xml"),$rxml)
    $records+=@{file=$name;bytes=$bytes.Length;sha256=(Get-FileHash -LiteralPath $dest -Algorithm SHA256).Hash.ToLowerInvariant();magic='RSC7';codeWalkerReload=$true}
}
$records | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $root 'evidence/live-screens-binaries.json')
$records | ForEach-Object { [pscustomobject]$_ } | Format-Table file,bytes,codeWalkerReload
