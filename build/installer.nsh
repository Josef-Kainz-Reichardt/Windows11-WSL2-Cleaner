; Migrate installs made before the app was renamed from "WSL2 Cleaner" to
; "Windows11-WSL2-Cleaner" (see CHANGELOG 1.0.1). electron-updater and a
; manually re-run installer both update in place at the existing $INSTDIR,
; so a pre-rename install never moves to the new default path on its own.
; Silently remove it here so the install proceeds fresh at the new location.

!macro customInit
  StrCpy $R0 "$PROGRAMFILES64\WSL2 Cleaner"
  IfFileExists "$R0\Uninstall WSL2 Cleaner.exe" 0 windows11wsl2cleaner_skip_pf
    DetailPrint "Entferne alte Installation unter $R0 ..."
    ExecWait '"$R0\Uninstall WSL2 Cleaner.exe" /S _?=$R0'
    RMDir /r "$R0"
  windows11wsl2cleaner_skip_pf:

  StrCpy $R0 "$LOCALAPPDATA\Programs\WSL2 Cleaner"
  IfFileExists "$R0\Uninstall WSL2 Cleaner.exe" 0 windows11wsl2cleaner_skip_local
    DetailPrint "Entferne alte Installation unter $R0 ..."
    ExecWait '"$R0\Uninstall WSL2 Cleaner.exe" /S _?=$R0'
    RMDir /r "$R0"
  windows11wsl2cleaner_skip_local:
!macroend
