!macro customInstall
  ; When running in silent mode (/S flag, used for updates),
  ; auto-launch the app since the MUI2 Finish page won't show.
  IfSilent 0 _skip_silent_launch
    Exec '"$INSTDIR\${PRODUCT_FILENAME}.exe"'
  _skip_silent_launch:
!macroend
