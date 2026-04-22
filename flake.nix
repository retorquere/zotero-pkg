{
  description = "Zotero";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  nixConfig = {
    extra-substituters = [ "https://retorquere.cachix.org" ];
    extra-trusted-public-keys = [ "retorquere.cachix.org-1:DXyflyaoVSgamtgmzgZk1L1m868q6c/zN89ewzEwmqQ=" ];
  };

  outputs = { self, nixpkgs }:
    let
      supportedSystems = [ "x86_64-linux" "i686-linux" "aarch64-linux" ];
      forAllSystems = nixpkgs.lib.genAttrs supportedSystems;

      data = builtins.fromJSON (builtins.readFile ./nix.json);

    in {
      packages = forAllSystems (system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in {
          zotero = pkgs.callPackage ./zotero-bin.nix {
            binName = "zotero";
            version = data.release.${system}.version;
            url = data.release.${system}.url;
            sha256 = data.release.${system}.hash;
          };

          zotero-beta = pkgs.callPackage ./zotero-bin.nix {
            binName = "zotero-beta";
            version = data.beta.${system}.version;
            url = data.beta.${system}.url;
            sha256 = data.beta.${system}.hash;
          };

          default = self.packages.${system}.zotero;
        }
      );
    };
}
