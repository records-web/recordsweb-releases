!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "WinMessages.nsh"
!include "StrFunc.nsh"

${StrCase}

Var RWOrganisationDialog
Var RWOrganisationInput
Var RWOrganisationCode

# RecordsWeb uses an assisted NSIS installer so a fresh Windows installation can
# be bound to the organisation namespace supplied by the RecordsWeb operator.
# Upgrades never prompt again: the existing value is preserved. Legacy Grove
# Way upgrades are automatically seeded to GW.HC so the current deployment does
# not lose its organisation when moving to this multi-organisation build.
!macro customPageAfterChangeDir
  Page custom RWOrganisationPage RWOrganisationPageLeave
!macroend

Function RWOrganisationPage
  ${If} ${isUpdated}
    Abort
  ${EndIf}

  # A true fresh install always shows this page. If a previous uninstall left
  # the per-user registry value behind, use it only as a convenient default so
  # the operator can still replace it for a repurposed workstation.
  ReadRegStr $RWOrganisationCode HKCU "Software\RecordsWeb" "OrganisationCode"

  !insertmacro MUI_HEADER_TEXT "RecordsWeb organisation" "Connect this installation to its organisation"

  nsDialogs::Create 1018
  Pop $RWOrganisationDialog
  ${If} $RWOrganisationDialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 24u "Enter the RecordsWeb extension supplied for this organisation."
  Pop $0

  ${NSD_CreateLabel} 0 29u 32% 12u "Organisation extension:"
  Pop $0

  ${NSD_CreateText} 34% 26u 40% 14u ""
  Pop $RWOrganisationInput
  SendMessage $RWOrganisationInput ${EM_SETLIMITTEXT} 6 0
  ${If} $RWOrganisationCode != ""
    ${NSD_SetText} $RWOrganisationInput "@$RWOrganisationCode"
  ${EndIf}

  ${NSD_CreateLabel} 0 51u 100% 30u "Format: @XX.XX (four letters). Example: @GW.HC. This controls the RecordsWeb login suffix and organisation data boundary."
  Pop $0

  ${NSD_SetFocus} $RWOrganisationInput
  nsDialogs::Show
FunctionEnd

Function RWOrganisationPageLeave
  ${NSD_GetText} $RWOrganisationInput $RWOrganisationCode
  ${StrCase} $RWOrganisationCode "$RWOrganisationCode" "U"

  # Trim a single leading @. The persisted value is XX.XX; RecordsWeb renders
  # the @ prefix in usernames and setup screens.
  StrCpy $0 "$RWOrganisationCode" 1 0
  ${If} $0 == "@"
    StrCpy $RWOrganisationCode "$RWOrganisationCode" "" 1
  ${EndIf}

  StrLen $0 "$RWOrganisationCode"
  ${If} $0 != 5
    Goto rw_invalid_org
  ${EndIf}

  StrCpy $0 "$RWOrganisationCode" 1 2
  ${If} $0 != "."
    Goto rw_invalid_org
  ${EndIf}

  # Validate all four non-dot characters as A-Z.
  StrCpy $0 "$RWOrganisationCode" 1 0
  Push "$0"
  Call RWIsAsciiLetter
  Pop $1
  ${If} $1 != "1"
    Goto rw_invalid_org
  ${EndIf}

  StrCpy $0 "$RWOrganisationCode" 1 1
  Push "$0"
  Call RWIsAsciiLetter
  Pop $1
  ${If} $1 != "1"
    Goto rw_invalid_org
  ${EndIf}

  StrCpy $0 "$RWOrganisationCode" 1 3
  Push "$0"
  Call RWIsAsciiLetter
  Pop $1
  ${If} $1 != "1"
    Goto rw_invalid_org
  ${EndIf}

  StrCpy $0 "$RWOrganisationCode" 1 4
  Push "$0"
  Call RWIsAsciiLetter
  Pop $1
  ${If} $1 != "1"
    Goto rw_invalid_org
  ${EndIf}

  Return

rw_invalid_org:
  MessageBox MB_ICONEXCLAMATION|MB_OK "Enter a valid RecordsWeb organisation extension in the format @XX.XX using letters only (for example @GW.HC)."
  Abort
FunctionEnd

Function RWIsAsciiLetter
  Exch $R0
  StrCpy $R1 "0"
  StrCmp $R0 "A" rw_letter_yes
  StrCmp $R0 "B" rw_letter_yes
  StrCmp $R0 "C" rw_letter_yes
  StrCmp $R0 "D" rw_letter_yes
  StrCmp $R0 "E" rw_letter_yes
  StrCmp $R0 "F" rw_letter_yes
  StrCmp $R0 "G" rw_letter_yes
  StrCmp $R0 "H" rw_letter_yes
  StrCmp $R0 "I" rw_letter_yes
  StrCmp $R0 "J" rw_letter_yes
  StrCmp $R0 "K" rw_letter_yes
  StrCmp $R0 "L" rw_letter_yes
  StrCmp $R0 "M" rw_letter_yes
  StrCmp $R0 "N" rw_letter_yes
  StrCmp $R0 "O" rw_letter_yes
  StrCmp $R0 "P" rw_letter_yes
  StrCmp $R0 "Q" rw_letter_yes
  StrCmp $R0 "R" rw_letter_yes
  StrCmp $R0 "S" rw_letter_yes
  StrCmp $R0 "T" rw_letter_yes
  StrCmp $R0 "U" rw_letter_yes
  StrCmp $R0 "V" rw_letter_yes
  StrCmp $R0 "W" rw_letter_yes
  StrCmp $R0 "X" rw_letter_yes
  StrCmp $R0 "Y" rw_letter_yes
  StrCmp $R0 "Z" rw_letter_yes
  Goto rw_letter_done
rw_letter_yes:
  StrCpy $R1 "1"
rw_letter_done:
  StrCpy $R0 "$R1"
  Exch $R0
FunctionEnd

!macro customInstall
  # Updater-driven installs preserve the existing organisation without showing
  # an interactive page. The first multi-organisation upgrade from the old
  # Grove-Way-only build is seeded to GW.HC when no registry value exists.
  ${If} ${isUpdated}
    ReadRegStr $0 HKCU "Software\RecordsWeb" "OrganisationCode"
    ${If} $0 != ""
      StrCpy $RWOrganisationCode "$0"
    ${Else}
      StrCpy $RWOrganisationCode "GW.HC"
    ${EndIf}
  ${EndIf}

  ${If} $RWOrganisationCode != ""
    CreateDirectory "$APPDATA\RecordsWeb"
    FileOpen $0 "$APPDATA\RecordsWeb\install-config.json" w
    FileWrite $0 '{$\"organisationCode$\":$\"$RWOrganisationCode$\"}'
    FileClose $0
    WriteRegStr HKCU "Software\RecordsWeb" "OrganisationCode" "$RWOrganisationCode"
  ${EndIf}
!macroend
