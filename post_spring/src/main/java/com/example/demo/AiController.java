package com.example.demo;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = {"http://localhost:3000", "http://localhost:5173"})
public class AiController {

    @Autowired
    private AiService aiService;

    @PostMapping("/ocr")
    public ResponseEntity<?> ocr(@RequestParam("file") MultipartFile file) {
        try {
            return ResponseEntity.ok(aiService.callOcr(file));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body("OCR 실패: " + e.getMessage());
        }
    }

    @GetMapping("/search")
    public ResponseEntity<?> search(@RequestParam String keyword) {
        try {
            return ResponseEntity.ok(aiService.searchAddress(keyword));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body("검색 실패: " + e.getMessage());
        }
    }

    @GetMapping("/health")
    public ResponseEntity<?> health() {
        return ResponseEntity.ok("Spring Boot 서버 실행 중");
    }
}
