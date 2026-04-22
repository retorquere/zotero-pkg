{ stdenv, makeDesktopItem, lib, pkgs, fetchurl, makeWrapper, binName ? "zotero", version, url, sha256 }:

let
  runtimeDeps = with pkgs; [
    alsa-lib atk cairo dbus dbus-glib fontconfig freetype gdk-pixbuf glib gtk3 libX11 libXcomposite
    libXcursor libXdamage libXext libXfixes libXi libXinerama libXrandr libXrender libXt libXtst
    libxcb libxshmfence mesa nspr nss pango libdrm libxkbcommon
  ];

  desktopItem = makeDesktopItem {
    name = binName; # Filename: zotero.desktop or zotero-beta.desktop
    desktopName = if binName == "zotero" then "Zotero" else "Zotero-bin";
    # Points to the wrapper created in installPhase
    exec = "${placeholder "out"}/bin/${binName} --url %u";
    icon = binName;
    type = "Application";
    terminal = false;
    categories = [ "Office" ];
    mimeTypes = [
      "x-scheme-handler/zotero"
      "application/x-endnote-refer"
      "application/x-research-info-systems"
      "text/ris"
      "text/x-research-info-systems"
      "application/x-inst-for-Scientific-info"
      "application/mods+xml"
      "application/rdf+xml"
      "application/x-bibtex"
      "text/x-bibtex"
      "application/marc"
      "application/vnd.citationstyles.style+xml"
    ];
    extraConfig = {
      X-GNOME-SingleWindow = "true";
    };
    comment = "Zotero is a free, easy-to-use tool to help you collect, organize, cite, and share research";
  };

in
stdenv.mkDerivation {
  pname = binName;
  inherit version;

  src = fetchurl {
    inherit url sha256;
  };

  nativeBuildInputs = [ makeWrapper ];
  buildInputs = runtimeDeps;

  dontBuild = true;
  dontStrip = true;
  dontPatchELF = true;

  installPhase = ''
    runHook preInstall

    mkdir -p $out/bin $out/libexec/${binName}
    cp -r ./* $out/libexec/${binName}/

    makeWrapper $out/libexec/${binName}/zotero $out/bin/${binName} \
      --prefix LD_LIBRARY_PATH : "${lib.makeLibraryPath runtimeDeps}"

    mkdir -p $out/share/applications
    cp ${desktopItem}/share/applications/* $out/share/applications/

    mkdir -p $out/share/icons/hicolor/128x128/apps
    cp ./icons/icon128.png $out/share/icons/hicolor/128x128/apps/${binName}.png

    runHook postInstall
  '';

  meta = with lib; {
    homepage = "https://www.zotero.org/";
    description = "Personal assistant to help you collect, organize, cite, and share research";
    platforms = [ "x86_64-linux" "i686-linux" "aarch64-linux" ];
    license = licenses.agpl3Only;
  };
}
