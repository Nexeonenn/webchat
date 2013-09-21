#!/bin/bash
git pull

ps --no-headers  --format pid | tr -d ' ' | while read line;do
	if pwdx $line 2>/dev/null | fgrep -- "$PWD/daemon" >/dev/null; then
		echo KILLING `cat "/proc/$line/cmdline" | tr '\000' ' '`
		kill $line
	fi
done

cd daemon || exit 1

#rm -rf node_modules
npm install socket.io  || exit 1
npm install net  || exit 1
npm install buffertools || exit 1

nohup ./launch >/dev/null 2>/dev/null &
cd ../website || exit 1

read -p "Host: " FFTP
read -p "User: " FUSR
read -s -p "password: " FPW
echo FTPing...

BASE="/public_html"

ftp -v -n $FFTP <<End-Of-Session
user "$FUSR" "$FPW"
binary
$(
for di in *;do
	echo mkdir "$BASE/$di"
	for f in $di/*;do
		echo "put \"$f\" \"$BASE/$f\" "
	done
done
)
bye
End-Of-Session
