param([Parameter(Mandatory)][string]$CodeWalker)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
foreach($n in @('SharpDX.dll','SharpDX.Mathematics.dll','CodeWalker.Core.dll')) {
    [Reflection.Assembly]::LoadFrom((Join-Path $CodeWalker $n)) | Out-Null
}
$inputDir=Join-Path $root 'intermediates'
$outputDir=Join-Path $root '../peak-duo-prop/stream'
$roundtrip=Join-Path $root 'evidence/roundtrip'
[IO.Directory]::CreateDirectory($roundtrip) | Out-Null
$records=@()
foreach($name in @('peak_duo_body.ydr','peak_duo_leaf.ydr','peak_duo.ytd','peak_duo.ytyp')) {
    $xml=[IO.File]::ReadAllText((Join-Path $inputDir "$name.xml"))
    switch([IO.Path]::GetExtension($name)) {
        '.ydr' { $asset=[CodeWalker.GameFiles.XmlYdr]::GetYdr($xml,(Join-Path $inputDir ([IO.Path]::GetFileNameWithoutExtension($name))));$bytes=$asset.Save();$loaded=[CodeWalker.GameFiles.YdrFile]::new() }
        '.ytd' { $asset=[CodeWalker.GameFiles.XmlYtd]::GetYtd($xml,(Join-Path $inputDir 'peak_duo'));$bytes=$asset.Save();$loaded=[CodeWalker.GameFiles.YtdFile]::new() }
        '.ytyp' { $doc=[xml]$xml;$bytes=[CodeWalker.GameFiles.XmlMeta]::GetRSCData($doc);$loaded=[CodeWalker.GameFiles.YtypFile]::new() }
    }
    if(!$bytes -or $bytes.Length -lt 32 -or [Text.Encoding]::ASCII.GetString($bytes,0,4) -ne 'RSC7'){throw "Invalid binary: $name"}
    $dest=Join-Path $outputDir $name;[IO.File]::WriteAllBytes($dest,$bytes)
    $loaded.Load([IO.File]::ReadAllBytes($dest))
    if($name -eq 'peak_duo.ytd') {
        foreach($texture in $loaded.TextureDict.Textures.data_items) {
            $dds=[CodeWalker.Utils.DDSIO]::GetDDSFile($texture)
            [IO.File]::WriteAllBytes((Join-Path $roundtrip ($texture.Name+'.dds')),$dds)
        }
    }
    $rxml=switch([IO.Path]::GetExtension($name)) {
        '.ydr' {[CodeWalker.GameFiles.YdrXml]::GetXml($loaded,$roundtrip)}
        '.ytd' {[CodeWalker.GameFiles.YtdXml]::GetXml($loaded,$roundtrip)}
        '.ytyp' {$fname='';[CodeWalker.GameFiles.MetaXml]::GetXml($loaded,[ref]$fname)}
    }
    if(!$rxml){throw "Roundtrip empty: $name"}
    [IO.File]::WriteAllText((Join-Path $roundtrip "$name.xml"),$rxml)
    $records+=@{file=$name;bytes=$bytes.Length;sha256=(Get-FileHash -LiteralPath $dest -Algorithm SHA256).Hash.ToLowerInvariant();magic='RSC7';codeWalkerReload=$true}
}
$records | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $root 'evidence/binary-assets.json')
$records | ForEach-Object { [pscustomobject]$_ } | Format-Table file,bytes,codeWalkerReload
