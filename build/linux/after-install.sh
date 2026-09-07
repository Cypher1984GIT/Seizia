#!/bin/bash

if type update-alternatives 2>/dev/null >&1; then
    if [ -L '/usr/bin/${executable}' -a -e '/usr/bin/${executable}' -a "`readlink '/usr/bin/${executable}'`" != '/etc/alternatives/${executable}' ]; then
        rm -f '/usr/bin/${executable}'
    fi
    update-alternatives --install '/usr/bin/${executable}' '${executable}' '/opt/${sanitizedProductName}/${executable}' 100 || ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
else
    ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
fi

if ! { [[ -L /proc/self/ns/user ]] && unshare --user true; }; then
    chmod 4755 '/opt/${sanitizedProductName}/chrome-sandbox' || true
else
    chmod 0755 '/opt/${sanitizedProductName}/chrome-sandbox' || true
fi

mkdir -p /usr/share/pixmaps /usr/share/metainfo

ICON_FILE=""
for candidate in \
    /usr/share/icons/hicolor/256x256/apps/${executable}.png \
    /usr/share/icons/hicolor/128x128/apps/${executable}.png \
    /usr/share/icons/hicolor/48x48/apps/${executable}.png \
    /opt/${sanitizedProductName}/resources/seizia.png
do
    if [ -f "$candidate" ]; then
        ICON_FILE="$candidate"
        break
    fi
done

if [ -n "$ICON_FILE" ]; then
    cp -f "$ICON_FILE" /usr/share/pixmaps/${executable}.png
    chmod 644 /usr/share/pixmaps/${executable}.png || true
fi

DESKTOP_FILE=/usr/share/applications/${executable}.desktop
if [ -f "$DESKTOP_FILE" ]; then
    if [ -f /usr/share/pixmaps/${executable}.png ]; then
        sed -i 's|^Icon=.*|Icon=/usr/share/pixmaps/${executable}.png|' "$DESKTOP_FILE"
    elif [ -n "$ICON_FILE" ]; then
        sed -i "s|^Icon=.*|Icon=$ICON_FILE|" "$DESKTOP_FILE"
    fi
    chmod 644 "$DESKTOP_FILE" || true
    touch "$DESKTOP_FILE" || true
fi

if [ -f /opt/${sanitizedProductName}/resources/metainfo.xml ]; then
    cp -f /opt/${sanitizedProductName}/resources/metainfo.xml /usr/share/metainfo/com.seizia.app.metainfo.xml
fi

if hash update-mime-database 2>/dev/null; then
    update-mime-database /usr/share/mime || true
fi

if hash update-desktop-database 2>/dev/null; then
    update-desktop-database -q /usr/share/applications || true
fi

if hash xdg-desktop-menu 2>/dev/null; then
    xdg-desktop-menu forceupdate || true
fi

if hash gtk-update-icon-cache 2>/dev/null; then
    gtk-update-icon-cache -f -t /usr/share/icons/hicolor >/dev/null 2>&1 || true
fi

if hash update-icon-caches 2>/dev/null; then
    update-icon-caches /usr/share/icons/hicolor >/dev/null 2>&1 || true
fi

if hash xdg-icon-resource 2>/dev/null; then
    if [ -f /usr/share/pixmaps/${executable}.png ]; then
        xdg-icon-resource install --novendor --mode system --size 256 /usr/share/pixmaps/${executable}.png ${executable} >/dev/null 2>&1 || true
    fi
    xdg-icon-resource forceupdate --theme hicolor >/dev/null 2>&1 || true
fi

if apparmor_status --enabled > /dev/null 2>&1; then
  APPARMOR_PROFILE_SOURCE='/opt/${sanitizedProductName}/resources/apparmor-profile'
  APPARMOR_PROFILE_TARGET='/etc/apparmor.d/${executable}'
  if apparmor_parser --skip-kernel-load --debug "$APPARMOR_PROFILE_SOURCE" > /dev/null 2>&1; then
    cp -f "$APPARMOR_PROFILE_SOURCE" "$APPARMOR_PROFILE_TARGET"
    if ! { [ -x '/usr/bin/ischroot' ] && /usr/bin/ischroot; } && hash apparmor_parser 2>/dev/null; then
      apparmor_parser --replace --write-cache --skip-read-cache "$APPARMOR_PROFILE_TARGET"
    fi
  else
    echo "Skipping the installation of the AppArmor profile as this version of AppArmor does not seem to support the bundled profile"
  fi
fi
