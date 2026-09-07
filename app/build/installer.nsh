!ifndef BUILD_UNINSTALLER

!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "WinMessages.nsh"
!include "StrFunc.nsh"

${StrCase}

Var RWOrganisationDialog
Var RWOrganisationInput
Var RWOrganisationCode
Var RWExistingInstall

# RecordsWeb uses an assisted NSIS installer so a fresh Windows installation can
# be bound to the organisation namespace supplied by the RecordsWeb operator.
#
# IMPORTANT: This file intentionally does NOT use electron-builder's ${isUpdated}
# macro. ${isUpdated} expands to StdUtils::TestParameter and, in electron-builder
# 25.x, a custom include can be parsed before the StdUtils plugin directory is
# available. That causes makensis to fail at package time. We instead detect an
# existing RecordsWeb installation from electron-builder's own registry key.

!macro customInit
  StrCpy $RWExistingInstall "0"
  StrCpy $RWOrganisationCode ""

  # Recover a namespace already stored by a previous multi-organisation build.
  ReadRegStr $RWOrganisationCode HKCU "Software\RecordsWeb" "OrganisationCode"
  ${If} $RWOrganisationCode == ""
    ReadRegStr $RWOrganisationCode HKLM "Software\RecordsWeb" "OrganisationCode"
  ${EndIf}

  # Detect an existing installation using the stable electron-builder app GUID
  # registry key. Check both contexts so this survives changes between per-user
  # and per-machine packaging and works for the legacy RecordsWeb install.
  ReadRegStr $0 HKCU "${INSTALL_REGISTRY_KEY}" "InstallLocation"
  ${If} $0 != ""
    StrCpy $RWExistingInstall "1"
  ${EndIf}

  ReadRegStr $1 HKLM "${INSTALL_REGISTRY_KEY}" "InstallLocation"
  ${If} $1 != ""
    StrCpy $RWExistingInstall "1"
  ${EndIf}

  # v3.1.9 and older were Grove-Way-only and therefore did not store an
  # OrganisationCode value. When such an install is upgraded, seed GW.HC so an
  # automatic update never stops to ask an interactive installer question.
  ${If} $RWExistingInstall == "1"
    ${If} $RWOrganisationCode == ""
      StrCpy $RWOrganisationCode "GW.HC"
    ${EndIf}
  ${EndIf}
!macroend

!macro customPageAfterChangeDir
  Page custom RWOrganisationPage RWOrganisationPageLeave
!macroend

Function RWOrganisationPage
  # Existing installs/upgrades keep their stored namespace and skip this page.
  # This check is based only on registry state and therefore needs no StdUtils.
  ${If} $RWExistingInstall == "1"
    Abort
  ${EndIf}

  # A fresh install always shows this page. If a previous uninstall deliberately
  # left the RecordsWeb namespace value behind, use it as a convenient default;
  # the operator can still replace it before continuing.
  ${If} $RWOrganisationCode == ""
    ReadRegStr $RWOrganisationCode HKCU "Software\RecordsWeb" "OrganisationCode"
  ${EndIf}

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
  # customInit has already loaded/preserved the organisation code for upgrades,
  # while a fresh interactive installation gets it from the custom page.
  ${If} $RWOrganisationCode != ""
    CreateDirectory "$APPDATA\RecordsWeb"
    FileOpen $0 "$APPDATA\RecordsWeb\install-config.json" w
    FileWrite $0 '{$\"organisationCode$\":$\"$RWOrganisationCode$\"}'
    FileClose $0

    # HKCU is the primary runtime fallback. HKLM is attempted too so a build
    # configured for all-users installation can preserve the same namespace.
    WriteRegStr HKCU "Software\RecordsWeb" "OrganisationCode" "$RWOrganisationCode"
    ClearErrors
    WriteRegStr HKLM "Software\RecordsWeb" "OrganisationCode" "$RWOrganisationCode"
    ClearErrors
  ${EndIf}
!macroend

!endif ; BUILD_UNINSTALLER
