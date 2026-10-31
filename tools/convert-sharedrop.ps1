$ErrorActionPreference='Stop'
$repository=Split-Path $PSScriptRoot -Parent
$cw=$env:PEAK_CODEWALKER
if(-not $cw){throw 'Set PEAK_CODEWALKER to a CodeWalker dev46 directory containing CodeWalker.Core.dll.'}
foreach($name in @('SharpDX.dll','SharpDX.Mathematics.dll','CodeWalker.Core.dll')) {
    [Reflection.Assembly]::LoadFrom((Join-Path $cw $name)) | Out-Null
}
$output=Join-Path $repository 'stream'
New-Item -ItemType Directory -Force -Path $output | Out-Null
$records=@()
foreach($sex in @('male','female')) {
    $name="peak_sharedrop_$sex.ycd"
    $xml=[IO.File]::ReadAllText((Join-Path $repository "extras/sharedrop-source/$name.xml"))
    $asset=[CodeWalker.GameFiles.XmlYcd]::GetYcd($xml)
    $bytes=$asset.Save()
    if([Text.Encoding]::ASCII.GetString($bytes,0,4) -ne 'RSC7'){throw "Invalid $name"}
    $dest=Join-Path $output $name
    [IO.File]::WriteAllBytes($dest,$bytes)
    $loaded=[CodeWalker.GameFiles.YcdFile]::new()
    [CodeWalker.GameFiles.RpfFile]::LoadResourceFile[CodeWalker.GameFiles.YcdFile]($loaded,$bytes,46)
    $roundtrip=[CodeWalker.GameFiles.YcdXml]::GetXml($loaded)
    [xml]$verified=$roundtrip
    $clips=@()
    foreach($role in @('send','receive')) {
        $key="peak_sharedrop_${sex}_$role"
        $clip=$verified.SelectSingleNode("/ClipDictionary/Clips/Item[Hash='$key']")
        $animation=$verified.SelectSingleNode("/ClipDictionary/Animations/Item[Hash='$key']")
        if(!$clip -or !$animation -or $clip.AnimationHash -ne $key){throw "Missing linked $role clip in $name"}
        if([double]$clip.EndTime.value -ne 3.2 -or [double]$animation.Duration.value -ne 3.2 -or [int]$animation.FrameCount.value -ne 97){throw "Invalid timing in $key"}
        if(!$animation.SelectSingleNode('BoneIds/Item[BoneId/@value="57005" and Track/@value="1"]')){throw "Missing right-hand rotation track in $key"}
        $clips+=@{dictionary="peak_sharedrop_$sex";clip=$key;duration=3.2;frames=97;rightHandRotation=$true}
    }
    $records+=@{file=$name;bytes=$bytes.Length;sha256=(Get-FileHash -LiteralPath $dest -Algorithm SHA256).Hash.ToLowerInvariant();codeWalkerReload=$true;clips=$clips}
}
$records | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $repository 'extras/sharedrop-source/runtime-assets.json')
$records | ForEach-Object { [pscustomobject]$_ } | Format-Table file,bytes,codeWalkerReload
