{
  description = "Zotero Tarball";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs = { self, nixpkgs }: 
    let
      systems = [ "x86_64-linux" "aarch64-linux" "i686-linux" ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
      data = builtins.fromJSON (builtins.readFile ./nix.json);
    in {
      packages = forAllSystems (system: 
        let 
          pkgs = import nixpkgs { inherit system; };
        in {
          zotero = pkgs.callPackage ./zotero-bin.nix {
            binName = "zotero";
            url      = data.release.${system}.url;
            version  = data.release.${system}.version;
            revision = data.release.${system}.revision or 0;
            sha256   = data.release.${system}.hash;
          };

          zotero-beta = pkgs.callPackage ./zotero-bin.nix {
            binName = "zotero-beta";
            url      = data.beta.${system}.url;
            version  = data.beta.${system}.version;
            revision = data.beta.${system}.revision or 0;
            sha256   = data.beta.${system}.hash;
          };

          default = self.packages.${system}.zotero;
        });
    };
}
