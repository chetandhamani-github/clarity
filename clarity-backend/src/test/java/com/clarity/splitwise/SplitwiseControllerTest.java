package com.clarity.splitwise;

import com.clarity.splitwise.controller.SplitwiseController;
import com.clarity.splitwise.dto.*;
import com.clarity.splitwise.service.SplitwiseService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(SplitwiseController.class)
class SplitwiseControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private SplitwiseService splitwiseService;

    @Test
    @DisplayName("POST /api/v1/splitwise/sync should return 200 with synced data")
    void shouldSyncDataSuccessfully() throws Exception {
        SplitSyncRequest request = SplitSyncRequest.builder()
                .installationId("inst-123")
                .people(List.of(SplitPersonDTO.builder().id("p1").name("Alice").build()))
                .debts(List.of(SplitDebtDTO.builder().id("d1").personId("p1").amount(new BigDecimal("100.00")).description("Lunch").type("OWE_ME").build()))
                .settlements(List.of())
                .build();

        SplitSyncResponse response = SplitSyncResponse.builder()
                .success(true)
                .syncedAt("2026-11-17T07:00:00Z")
                .confirmedIds(List.of("p1", "d1"))
                .people(List.of())
                .debts(List.of())
                .settlements(List.of())
                .build();

        when(splitwiseService.sync(eq("inst-123"), any(SplitSyncRequest.class), any())).thenReturn(response);

        mockMvc.perform(post("/api/v1/splitwise/sync")
                        .header("X-Installation-Id", "inst-123")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.confirmedIds[0]").value("p1"))
                .andExpect(jsonPath("$.confirmedIds[1]").value("d1"));
    }

    @Test
    @DisplayName("GET /api/v1/splitwise/summary should return summary stats")
    void shouldReturnSummary() throws Exception {
        SplitwiseSummaryResponse summary = SplitwiseSummaryResponse.builder()
                .totalPeople(3)
                .totalDebts(5)
                .totalSettlements(2)
                .totalOwedToMe(new BigDecimal("500.00"))
                .totalIOwe(new BigDecimal("150.00"))
                .netBalance(new BigDecimal("350.00"))
                .build();

        when(splitwiseService.getSummary("inst-123")).thenReturn(summary);

        mockMvc.perform(get("/api/v1/splitwise/summary").header("X-Installation-Id", "inst-123"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalPeople").value(3))
                .andExpect(jsonPath("$.netBalance").value(350.00));
    }
}
