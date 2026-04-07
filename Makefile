repo:
	npm start

crepo:
	crystal rebuild-apt.cr

zotero-archive-keyring.asc:
	gpg --keyring ./zotero-archive-keyring.gpg --no-default-keyring --homedir /dev/null --export -a > zotero-archive-keyring.asc
