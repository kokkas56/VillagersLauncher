// Сверка хэша запекания: Java (игра, StudioBakeData) против JS (fxlib.js). Запускает studio7.test.cjs, если есть javac и gson.
// Вход: файлы *.json в папке аргумента; выход: «имя хэш» по строке + проверка выборки камеры.
import java.nio.file.*;
import java.util.*;
import com.google.gson.*;
import com.kokk.story.studio.StudioBakeData;

public class BakeParity {
    public static void main(String[] a) throws Exception {
        List<Path> fs = new ArrayList<>();
        try (DirectoryStream<Path> d = Files.newDirectoryStream(Paths.get(a[0]), "*.json")) { for (Path p : d) fs.add(p); }
        Collections.sort(fs);
        for (Path p : fs) {
            JsonObject o = JsonParser.parseString(Files.readString(p)).getAsJsonObject();
            System.out.println(p.getFileName().toString().replace(".json", "") + " " + StudioBakeData.hash(o));
        }
    }
}
