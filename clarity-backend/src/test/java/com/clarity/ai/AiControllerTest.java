package com.clarity.ai;

import com.clarity.ai.controller.AiController;
import com.clarity.ai.dto.*;
import com.clarity.ai.service.AiService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(AiController.class)
class AiControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private AiService aiService;

    @Test
    @DisplayName("POST /api/v1/ai/categorize should return 200 with category prediction")
    void shouldCategorizeTransaction() throws Exception {
        AiCategorizeRequest request = AiCategorizeRequest.builder()
                .merchant("Starbucks Coffee")
                .amount(350.0)
                .build();

        AiCategorizeResponse response = AiCategorizeResponse.builder()
                .category("Food & Dining")
                .confidence(0.92)
                .suggestedBudgetBucket("wants")
                .isRecurringSubscription(false)
                .cleanMerchant("Starbucks Coffee")
                .build();

        when(aiService.categorize(any(AiCategorizeRequest.class))).thenReturn(response);

        mockMvc.perform(post("/api/v1/ai/categorize")
                        .header("X-Installation-Id", "inst-123456")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.category").value("Food & Dining"))
                .andExpect(jsonPath("$.confidence").value(0.92))
                .andExpect(jsonPath("$.suggestedBudgetBucket").value("wants"))
                .andExpect(jsonPath("$.cleanMerchant").value("Starbucks Coffee"));
    }

    @Test
    @DisplayName("POST /api/v1/ai/receipt-scan should return 200 with extracted receipt items")
    void shouldScanReceipt() throws Exception {
        ReceiptScanRequest request = ReceiptScanRequest.builder()
                .imageBase64("base64data")
                .mimeType("image/jpeg")
                .build();

        ReceiptScanResponse response = ReceiptScanResponse.builder()
                .merchant("Fresh Supermarket")
                .totalAmount(850.0)
                .taxAmount(42.5)
                .date("2026-11-18")
                .confidence(0.95)
                .category("Groceries")
                .items(List.of(
                        ReceiptItemDTO.builder().name("Apples").amount(120.0).category("Groceries").quantity(1).build()
                ))
                .build();

        when(aiService.scanReceipt(any(ReceiptScanRequest.class))).thenReturn(response);

        mockMvc.perform(post("/api/v1/ai/receipt-scan")
                        .header("X-Installation-Id", "inst-123456")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.merchant").value("Fresh Supermarket"))
                .andExpect(jsonPath("$.totalAmount").value(850.0))
                .andExpect(jsonPath("$.category").value("Groceries"))
                .andExpect(jsonPath("$.items.length()").value(1));
    }

    @Test
    @DisplayName("POST /api/v1/ai/chat should return 200 with copilot reply")
    void shouldChatWithCopilot() throws Exception {
        AiChatRequest request = AiChatRequest.builder()
                .message("How can I save more?")
                .financialContextSummary("Income: 50000, Expense: 30000")
                .build();

        AiChatResponse response = AiChatResponse.builder()
                .reply("Try setting a dining budget.")
                .suggestedAction("/(app)/(tabs)/plan")
                .build();

        when(aiService.chat(any(AiChatRequest.class))).thenReturn(response);

        mockMvc.perform(post("/api/v1/ai/chat")
                        .header("X-Installation-Id", "inst-123456")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reply").value("Try setting a dining budget."))
                .andExpect(jsonPath("$.suggestedAction").value("/(app)/(tabs)/plan"));
    }

    @Test
    @DisplayName("POST /api/v1/ai/digest should return 200 with monthly health digest")
    void shouldGenerateMonthlyDigest() throws Exception {
        MonthlyDigestRequest request = MonthlyDigestRequest.builder()
                .month(11)
                .year(2026)
                .totalIncome(70000.0)
                .totalExpenses(35000.0)
                .topCategories(List.of("Groceries: 10000"))
                .build();

        MonthlyDigestResponse response = MonthlyDigestResponse.builder()
                .headline("Great Progress: You saved 50% this month!")
                .savingsAssessment("Your savings rate exceeded your target by 30%.")
                .insights(List.of("Groceries was your main expense."))
                .actionableTips(List.of("Maintain emergency fund"))
                .financialHealthScore(85)
                .build();

        when(aiService.generateDigest(any(MonthlyDigestRequest.class))).thenReturn(response);

        mockMvc.perform(post("/api/v1/ai/digest")
                        .header("X-Installation-Id", "inst-123456")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.financialHealthScore").value(85))
                .andExpect(jsonPath("$.headline").value("Great Progress: You saved 50% this month!"))
                .andExpect(jsonPath("$.actionableTips.length()").value(1));
    }

    @Test
    @DisplayName("POST /api/v1/ai/digest should return 400 when month is invalid")
    void shouldRejectInvalidMonthInDigest() throws Exception {
        MonthlyDigestRequest invalid = MonthlyDigestRequest.builder()
                .month(13)
                .year(2026)
                .totalIncome(50000.0)
                .totalExpenses(20000.0)
                .build();

        mockMvc.perform(post("/api/v1/ai/digest")
                        .header("X-Installation-Id", "inst-123456")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(invalid)))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("POST /api/v1/ai/categorize should return 401 when client identity missing")
    void shouldRejectUnauthenticatedAiCall() throws Exception {
        AiCategorizeRequest request = AiCategorizeRequest.builder()
                .merchant("Starbucks Coffee")
                .amount(350.0)
                .build();

        mockMvc.perform(post("/api/v1/ai/categorize")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isUnauthorized());
    }
}
