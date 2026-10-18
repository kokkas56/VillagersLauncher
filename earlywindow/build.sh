#!/bin/bash
# Сборка провайдера раннего окна (villagers-earlywindow.jar) из библиотек игры, без Gradle.
# LIBS — папка с earlydisplay/loader/lwjgl jar'ами (из libraries игры).
set -e
cd "$(dirname "$0")"
LIBS=${LIBS:-../../libs}
CP="$LIBS/earlydisplay-4.0.44.jar:$LIBS/loader-4.0.44.jar:$LIBS/lwjgl-3.3.3.jar:$LIBS/lwjgl-opengl-3.3.3.jar:$LIBS/lwjgl-stb-3.3.3.jar:$LIBS/slf4j-api-2.0.9.jar"
rm -rf out && mkdir out
javac --release 21 -encoding UTF-8 -cp "$CP" -d out src/ru/kokk/earlywindow/*.java
cp -r res/. out/
(cd out && jar --create --file ../../electron/assets/villagers-earlywindow-1.0.0.jar --manifest META-INF/MANIFEST.MF .)
rm -rf out
echo "OK -> electron/assets/villagers-earlywindow-1.0.0.jar"
