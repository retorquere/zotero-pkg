{ stdenv , lib , pkgs , fetchurl , makeWrapper , binName ? "zotero" , version , url , sha256 }:

let
  runtimeDeps = with pkgs; [
    alsa-lib atk cairo dbus dbus-glib fontconfig freetype gdk-pixbuf glib gtk3 libX11 libXcomposite
    libXcursor libXdamage libXext libXfixes libXi libXinerama libXrandr libXrender libXt libXtst
    libxcb libxshmfence mesa nspr nss pango libdrm libxkbcommon
  ];
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
    mkdir -p $out/bin $out/libexec/${binName}
    cp -r ./* $out/libexec/${binName}/

    makeWrapper $out/libexec/${binName}/zotero $out/bin/${binName} \
      --prefix LD_LIBRARY_PATH : "${lib.makeLibraryPath runtimeDeps}"
  '';

  meta = with lib; {
    homepage = "https://www.zotero.org/";
    description = "Personal assistant to help you collect, organize, cite, and share research";
    platforms = [ "x86_64-linux" "i686-linux" "aarch64-linux" ];
    license = licenses.agpl3Only;
  };
}
