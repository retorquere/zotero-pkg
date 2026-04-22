{ pkgs, binName, url, version, revision ? 0, sha256 }:

let
  nixVersion = "${version}${if revision != 0 then "-${toString revision}" else ""}";
in 
pkgs.stdenv.mkDerivation {
  pname = binName;
  version = nixVersion;

  src = pkgs.fetchurl {
    inherit url sha256;
  };

  nativeBuildInputs = [ pkgs.autoPatchelfHook pkgs.makeWrapper ];

  buildInputs = with pkgs; [
    alsa-lib at-spi2-atk at-spi2-core cairo dbus-glib fontconfig
    freetype gdk-pixbuf glib gtk3 libGL libX11 libXcomposite
    libXdamage libXext libXfixes libXi libXrandr libXrender
    libXt libevent mesa nspr nss pango zlib
  ];

  installPhase = ''
    mkdir -p $out/bin $out/libexec/${binName}
    cp -r ./* $out/libexec/${binName}
    
    makeWrapper $out/libexec/${binName}/zotero $out/bin/${binName} \
      --prefix LD_LIBRARY_PATH : "${pkgs.lib.makeLibraryPath buildInputs}"
  '';
}
