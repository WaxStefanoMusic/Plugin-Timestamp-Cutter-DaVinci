' Silent launcher per il Video Timestamp Cutter Installer.
' Avvia install.ps1 in modalita' STA senza mostrare la finestra di PowerShell.
' Il pop-up UAC e l'interfaccia WPF verranno mostrati dall'installer stesso.

Option Explicit

Dim fso, sh, scriptDir, psPath, args
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
psPath = scriptDir & "\installer\install.ps1"

If Not fso.FileExists(psPath) Then
    MsgBox "Installer non trovato:" & vbCrLf & psPath & vbCrLf & vbCrLf & _
           "Assicurati di aver estratto l'intero contenuto del pacchetto.", _
           vbCritical, "Video Timestamp Cutter - Installer"
    WScript.Quit 1
End If

args = "-NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File """ & _
       psPath & """ -SourceRoot """ & scriptDir & """"

' Run hidden (0) - the WPF window pops up from the elevated child process.
sh.Run "powershell.exe " & args, 0, False
