package com.clarity;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

@SpringBootApplication
public class ClarityApplication {

    public static void main(String[] args) {
        loadDotenv();
        SpringApplication.run(ClarityApplication.class, args);
    }

    private static void loadDotenv() {
        try {
            Path[] candidatePaths = new Path[]{
                    Path.of(".env"),
                    Path.of("clarity-backend/.env"),
                    Path.of("../.env")
            };
            for (Path path : candidatePaths) {
                if (Files.exists(path)) {
                    List<String> lines = Files.readAllLines(path);
                    for (String line : lines) {
                        String trimmed = line.trim();
                        if (trimmed.isEmpty() || trimmed.startsWith("#")) continue;
                        if (trimmed.startsWith("export ")) {
                            trimmed = trimmed.substring(7).trim();
                        }
                        int eqIdx = trimmed.indexOf('=');
                        if (eqIdx > 0) {
                            String key = trimmed.substring(0, eqIdx).trim();
                            String value = trimmed.substring(eqIdx + 1).trim();
                            if ((value.startsWith("\"") && value.endsWith("\"")) ||
                                    (value.startsWith("'") && value.endsWith("'"))) {
                                value = value.substring(1, value.length() - 1);
                            }
                            if (System.getProperty(key) == null && System.getenv(key) == null) {
                                System.setProperty(key, value);
                            }
                        }
                    }
                    break;
                }
            }
        } catch (Exception ignored) {
            // Non-critical: proceed with existing environment configuration
        }
    }
}
