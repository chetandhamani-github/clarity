package com.clarity.announcement.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Announcement information payload")
public class AnnouncementResponse {

    @Schema(description = "Unique announcement identifier", example = "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d")
    private UUID id;

    @Schema(description = "Announcement title or headline", example = "Welcome to Clarity")
    private String title;

    @Schema(description = "Full announcement body message", example = "Clarity keeps all your financial data private on device.")
    private String message;

    @Schema(description = "Timestamp when announcement was published", example = "2026-09-01T12:00:00Z")
    private Instant createdAt;
}
