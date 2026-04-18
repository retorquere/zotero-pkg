<a href="https://www.zotero.org/"><img src="https://www.zotero.org/static/images/promote/zotero-logo-256x62.png" alt="Zotero"></a><!-- a href="https://juris-m.github.io/"><img src="https://juris-m.github.io/blog/image/juris-m-logo.svg" alt="Juris-M" height="62" align="right"></a -->

# Primary source:

<!-- * packages: https://zotero.retorque.re/file/apt-package-archive/index.html -->
* https://zotero.retorque.re/file/apt-package-archive

(re)install using
```
curl -sL https://raw.githubusercontent.com/retorquere/zotero-deb/master/install.sh | sudo bash
```

**Mirrors:**

See `install.sh` explanation below and adjust URL accordingly

<!-- * ~https://zotero-deb.mirror.ioperf.eu/~ down at the moment -->
* https://mirror.mwt.me/zotero/deb

----

This repository contains packaged releases of [Zotero](https://www.zotero.org) <!-- and [Juris-M](https://juris-m.github.io) --> for Debian-based Linux systems and Crostini-enabled chromebooks, and the script used to build them. It also offers the latest nightly zotero-beta.

This repository updates to new releases of Zotero <!-- and Juris-M --> within 2 hours, usually faster.

## Contents of the packages

The packages include the whole Zotero<!-- /Juris-M --> binaries, as built by Zotero <!-- / Juris-M --> teams themselves.

The packages provide a system-wide installation (into the `/usr/lib` directory), as opposed to a single-user installation (e.g. in your `HOME` directory).

They manage both desktop file registration and MimeType registration.

## Installing Zotero <!-- / Juris-M -->

If you're previously used the tarball install, delete `~/.local/share/applications/zotero.desktop`.

### Installing Zotero

To install Zotero, use the following commands:

```
wget -qO- https://raw.githubusercontent.com/retorquere/zotero-deb/master/install.sh | sudo bash
sudo apt update
sudo apt install zotero
```

<!--
### Installing Juris-M

To install Juris-M, use the following commands:

```
wget -qO- https://raw.githubusercontent.com/retorquere/zotero-deb/master/install.sh | sudo bash
sudo apt update
sudo apt install jurism
```
-->

**Note**

You can use `curl` instead of `wget` by typing
```
curl -sL https://raw.githubusercontent.com/retorquere/zotero-deb/master/install.sh | sudo bash
```

## Updating Zotero <!-- / Juris-M -->

The Zotero <!-- / Juris-M --> programs provided by this repository have their self-update facility disabled.

Simply rely on on your system's package manager to give you update notifications when a new version comes out.

Alternatively, you can use the following commands:

```
sudo apt update
sudo apt upgrade
```

install.sh will ask for sudo permissions to install the pointer to the apt repo, and to add the signing key to the keyring.

## Beta packages

This repo also has the nightly beta's, installable as the `zotero-beta` <!-- and `jurism-beta` --> package<!-- s -->. You can install these alongside the regular packages.

## Package signing errors in Debian/Ubuntu/...

The accepted key format in Debian-based systems seems to have changed a while ago, which means the existing signing verification key you have may no longer be available during install. Re-running the install script will remedy that:

```
wget -qO- https://raw.githubusercontent.com/retorquere/zotero-deb/master/install.sh | sudo bash
```

## Instructions for installation using the new deb822 repo pointer format

add the `-m sources` flag to the install script to install the new deb822 repo pointer format:

```
curl -sL https://raw.githubusercontent.com/retorquere/zotero-deb/master/install.sh | sudo bash -s -- -m sources
```

## Instructions for installation on Crostini-capable Chromebooks

Instructions for installation on Crostini-capable Chromebooks can be found on the [wiki](https://github.com/retorquere/zotero-deb/wiki).

## Uninstall

```
wget -qO- https://raw.githubusercontent.com/retorquere/zotero-deb/master/uninstall.sh | sudo bash
sudo apt-get purge zotero
```

## What goes on under the hood in `install.sh`

The install.sh is convenient, but there's a risk to running random scripts from the internet as root. The script is fairly simple though, and the actions can be done by hand fairly easily. In the end it installs either `/etc/apt/sources.list.d/zotero.list` or `/etc/apt/sources.list.d/zotero.sources` and the regular apt infrastructure is used from that point on.

# Developers

To rebuild this repo you need:

* a deb-based system (I use Ubuntu)
* node

