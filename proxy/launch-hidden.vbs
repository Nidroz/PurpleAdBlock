Set WshShell = CreateObject("WScript.Shell")
q = Chr(34)
WshShell.Run q & "C:\Program Files\nodejs\node.exe" & q & " " & q & "C:\Users\Nidro\Desktop\INFO\ExtensionsWeb\PurpleAdBlock\proxy\index.js" & q, 0, False
