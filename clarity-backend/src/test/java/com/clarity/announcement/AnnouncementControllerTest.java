package com.clarity.announcement;

import com.clarity.announcement.controller.AnnouncementController;
import com.clarity.announcement.dto.AnnouncementResponse;
import com.clarity.announcement.service.AnnouncementService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(AnnouncementController.class)
class AnnouncementControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private AnnouncementService announcementService;

    @Test
    @DisplayName("GET /api/v1/announcements should return 200 with active announcements list")
    void shouldReturnActiveAnnouncements() throws Exception {
        UUID announcementId = UUID.randomUUID();
        AnnouncementResponse announcement = AnnouncementResponse.builder()
                .id(announcementId)
                .title("Welcome to Clarity")
                .message("Clarity keeps all your financial data private on device.")
                .createdAt(Instant.parse("2026-09-01T12:00:00Z"))
                .build();

        when(announcementService.getActiveAnnouncements()).thenReturn(List.of(announcement));

        mockMvc.perform(get("/api/v1/announcements"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(announcementId.toString()))
                .andExpect(jsonPath("$[0].title").value("Welcome to Clarity"))
                .andExpect(jsonPath("$[0].message").value("Clarity keeps all your financial data private on device."))
                .andExpect(jsonPath("$[0].createdAt").value("2026-09-01T12:00:00Z"));
    }
}
