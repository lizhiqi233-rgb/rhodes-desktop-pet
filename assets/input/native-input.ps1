$ErrorActionPreference = 'Stop'
try {
    Add-Type -AssemblyName System.Windows.Forms
    $references = @(
        [System.Windows.Forms.NativeWindow].Assembly.Location,
        [System.Collections.Generic.HashSet[string]].Assembly.Location
    )
    Add-Type -Path @(
        (Join-Path $PSScriptRoot 'native-input.cs'),
        (Join-Path $PSScriptRoot 'native-input-capture.cs')
    ) -ReferencedAssemblies $references
    $watcher = [RhodesNativeInput.NativeInputWatcher]::new()
    [Console]::Out.WriteLine('{"type":"ready"}')
    [Console]::Out.Flush()
    $running = $true
    while ($running) {
        $command = [Console]::In.ReadLine()
        if ($null -eq $command) { break }
        switch ($command) {
            'enable' { $watcher.Enable() }
            'disable' { $watcher.Disable() }
            'flush' { $watcher.Flush() }
            'exit' { $running = $false }
            default {
                [Console]::Error.WriteLine('Invalid native input helper command.')
                $running = $false
            }
        }
    }
    $watcher.Dispose()
    exit 0
} catch {
    [Console]::Error.WriteLine('Native input helper failed to start.')
    exit 1
}
