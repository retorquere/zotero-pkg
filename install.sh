# https://wiki.debian.org/DebianRepository/UseThirdParty

case `uname -m` in
  "aarch64" | "arm64" | "i386" | "i686" | "x86_64")
    ;;
  *)
    echo "Zotero is only available for architectures aarch64/arm64, i386, i686 and x86_64; you are on" `uname -m`
    exit
    ;;
esac

check_dir() {
  dir=$1
  if [ ! -d "$dir" ] || [ ! -w "$dir" ]; then
    echo "Directory does not exist or is not writable: $dir"
    exit 1
  fi
}

download() {
  local url="$1"
  local filepath="$2"

  # Check if wget or curl is installed
  if command -v wget > /dev/null; then
    if [ -z "$filepath" ]; then
      wget -qO- "$url"
    else
      wget -qO "$filepath" "$url"
    fi
  elif command -v curl > /dev/null; then
    if [ -z "$filepath" ]; then
      curl -s "$url"
    else
      curl -s -o "$filepath" "$url"
    fi
  else
    echo "Error: Neither wget nor curl is installed." >&2
    return 1
  fi
}

check_dir /etc/apt/sources.list.d

export GNUPGHOME="/dev/null"

REPO="https://zotero.retorque.re/file/apt-package-archive"
MODE="list"

while getopts ":r:m:" opt; do
  case $opt in
    r)
      REPO=$OPTARG
      ;;
    m)
      MODE=$OPTARG
      ;;
    ?)
      echo "Invalid option: -$OPTARG" >&2
      exit 1
      ;;
    :)
      echo "Option -$OPTARG requires an argument." >&2
      ;;
  esac
done

# old key with too broad reach
if [ -f /etc/apt/trusted.gpg.d/zotero.gpg ]; then
  sudo rm -f /etc/apt/trusted.gpg.d/zotero.gpg
fi

KEYBASE=https://raw.githubusercontent.com/retorquere/zotero-pkg/master
KEYNAME=zotero-archive-keyring.gpg
KEYRING="/usr/share/keyrings/$KEYNAME"
LIST=/etc/apt/sources.list.d/zotero.list
SOURCES=/etc/apt/sources.list.d/zotero.sources

if [ "$MODE" = "list" ]; then

check_dir /usr/share/keyrings
rm -f $SOURCES

download "$KEYBASE/$KEYNAME" "$KEYRING"
sudo chmod 644 $KEYRING
cat << EOF | sudo tee /etc/apt/sources.list.d/zotero.list
deb [signed-by=$KEYRING by-hash=force] $REPO ./
EOF

else

rm -f $KEYRING $LIST

KEYNAME="${KEYNAME/.gpg/.asc}"
GPGKEY=$(download "$KEYBASE/$KEYNAME" | sed 's/^$/./' | sed 's/^/ /')
cat << EOF | sudo tee $SOURCES
Types: deb
URIs: $REPO
Suites: ./
By-Hash: force
Signed-By:$GPGKEY
EOF

fi

sudo apt-get clean
