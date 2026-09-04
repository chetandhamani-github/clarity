package com.clarity.announcement.controller;

import com.clarity.announcement.dto.AnnouncementResponse;
import com.clarity.announcement.service.AnnouncementService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/announcements")
@RequiredArgsConstructor
@Tag(name = "Announcements", description = "In-app broadcast announcements endpoints")
public class AnnouncementController {

    private final AnnouncementService announcementService;

    @GetMapping
    @Operation(summary = "Get active announcements", description = "Retrieves all active in-app announcements ordered by publish date descending")
    @ApiResponse(responseCode = "200", description = "Announcements retrieved successfully",
            content = @Content(array = @ArraySchema(schema = @Schema(implementation = AnnouncementResponse.class))))
    public ResponseEntity<List<AnnouncementResponse>> getAnnouncements() {
        List<AnnouncementResponse> announcements = announcementService.getActiveAnnouncements();
        return ResponseEntity.ok(announcements);
    }
}
