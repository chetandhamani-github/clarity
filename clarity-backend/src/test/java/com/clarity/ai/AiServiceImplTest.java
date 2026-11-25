package com.clarity.ai;

import com.clarity.ai.dto.MonthlyDigestRequest;
import com.clarity.ai.dto.MonthlyDigestResponse;
import com.clarity.ai.service.AiServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class AiServiceImplTest {

    private AiServiceImpl aiService;

    @BeforeEach
    void setUp() {
        aiService = new AiServiceImpl();
    }

    @Test
    @DisplayName("Uses canonical on-device health score when provided")
    void shouldPreserveCanonicalHealthScore() {
        MonthlyDigestRequest request = MonthlyDigestRequest.builder()
                .month(11)
                .year(2026)
                .totalIncome(0.0)
                .plannedIncome(80000.0)
                .totalExpenses(45000.0)
                .canonicalHealthScore(77)
                .currencySymbol("$")
                .topCategories(List.of("Rent: 20000"))
                .build();

        MonthlyDigestResponse response = aiService.generateDigest(request);

        assertEquals(77, response.getFinancialHealthScore());
        assertTrue(response.getHeadline().contains("43.8%"));
        assertTrue(response.getInsights().stream().anyMatch(i -> i.contains("$45,000")));
    }

    @Test
    @DisplayName("Does not emit broken 100.0% headline when expenses exceed income")
    void shouldReportAccurateOverspendHeadline() {
        MonthlyDigestRequest request = MonthlyDigestRequest.builder()
                .month(11)
                .year(2026)
                .totalIncome(50000.0)
                .totalExpenses(75000.0)
                .canonicalHealthScore(62)
                .build();

        MonthlyDigestResponse response = aiService.generateDigest(request);

        assertEquals(62, response.getFinancialHealthScore());
        assertFalse(response.getHeadline().contains("100.0%"));
        assertTrue(response.getHeadline().contains("50.0%"));
    }

    @Test
    @DisplayName("Handles zero income with recorded expenses cleanly")
    void shouldHandleZeroIncomeWithExpenses() {
        MonthlyDigestRequest request = MonthlyDigestRequest.builder()
                .month(11)
                .year(2026)
                .totalIncome(0.0)
                .totalExpenses(12000.0)
                .currencySymbol("₹")
                .build();

        MonthlyDigestResponse response = aiService.generateDigest(request);

        assertFalse(response.getHeadline().contains("100.0%"));
        assertTrue(response.getHeadline().contains("no income logged yet"));
        assertEquals(45, response.getFinancialHealthScore());
    }

    @Test
    @DisplayName("Clamps out-of-range canonical health score")
    void shouldClampCanonicalHealthScore() {
        MonthlyDigestRequest request = MonthlyDigestRequest.builder()
                .month(11)
                .year(2026)
                .totalIncome(50000.0)
                .totalExpenses(10000.0)
                .canonicalHealthScore(140)
                .build();

        MonthlyDigestResponse response = aiService.generateDigest(request);

        assertEquals(100, response.getFinancialHealthScore());
    }
}
