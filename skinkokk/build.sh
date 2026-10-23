#!/bin/bash
# Сборка SkinKokk без Gradle: build.sh  -> build/skinkokk-<ver>.jar  и  /mnt/user-data/outputs/skinkokk.jar (имя в mods сборки)
# env: CP_DIR (библиотеки, по умолчанию /home/claude/kokk/cp), PACK_NAME (по умолчанию skinkokk.jar), OUT_DIR
set -e
P=$(cd "$(dirname "$0")" && pwd)
CP_DIR=${CP_DIR:-/home/claude/kokk/cp}
PACK_NAME=${PACK_NAME:-skinkokk.jar}
OUT_DIR=${OUT_DIR:-/mnt/user-data/outputs}
export JAVA_TOOL_OPTIONS=
V=$(grep '^mod_version=' $P/gradle.properties | cut -d= -f2)
W=$(mktemp -d)
mkdir -p $W/jar
javac --release 21 -proc:none -encoding UTF-8 -nowarn -d $W/jar -cp "$(ls $CP_DIR/*.jar | tr '\n' ':')" $(find $P/src/main/java -name '*.java') 2>&1 | grep -v "Picked up\|^Note:" || true
[ -f $W/jar/ru/kokk/skinkokk/SkinKokk.class ] && [ -f $W/jar/ru/kokk/skinkokk/character/client/CharRender.class ] || { echo COMPILE FAILED; rm -rf $W; exit 1; }
cp -r $P/src/main/resources/. $W/jar/
python3 - "$P" "$W" <<'PY'
import re,sys,os
P,W=sys.argv[1],sys.argv[2]
props={}
for line in open(P+'/gradle.properties',encoding='utf-8'):
    line=line.strip()
    if line and not line.startswith('#') and '=' in line:
        a,b=line.split('=',1); props[a.strip()]=b.strip()
t=open(P+'/src/main/templates/META-INF/neoforge.mods.toml',encoding='utf-8').read()
t=re.sub(r'\$\{(\w+)\}',lambda m: props.get(m.group(1),m.group(0)),t)
os.makedirs(W+'/jar/META-INF',exist_ok=True)
open(W+'/jar/META-INF/neoforge.mods.toml','w',encoding='utf-8').write(t)
PY
printf 'Manifest-Version: 1.0\nImplementation-Title: SkinKokk\nImplementation-Version: %s\n' "$V" > $W/MANIFEST.MF
mkdir -p $P/build $OUT_DIR
OUT=$P/build/skinkokk-$V.jar
rm -f $OUT
(cd $W/jar && jar --create --file $OUT --manifest $W/MANIFEST.MF .)
cp $OUT $OUT_DIR/$PACK_NAME
ls -la $OUT $OUT_DIR/$PACK_NAME
rm -rf $W
