package com.clarity.ai.service;

import com.clarity.ai.dto.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.LocalDate;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@Slf4j
@RequiredArgsConstructor
public class AiServiceImpl implements AiService {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${clarity.ai.gemini.api-key:}")
    private String geminiApiKey;

    @Value("${clarity.ai.gemini.model:gemini-flash-lite-latest}")
    private String geminiModel;

    @Override
    public AiCategorizeResponse categorize(AiCategorizeRequest request) {
        String raw = request.getMerchant() != null ? request.getMerchant() : "";
        String clean = cleanMerchantName(raw);
        String lower = raw.toLowerCase();

        String category = "General";
        String bucket = "wants";
        boolean isRecurring = false;
        double confidence = 0.85;

        if (lower.contains("swiggy") || lower.contains("zomato") || lower.contains("mcdonald")
                || lower.contains("starbucks") || lower.contains("cafe") || lower.contains("restro")
                || lower.contains("restaurant") || lower.contains("bites") || lower.contains("hotel")
                || lower.contains("sagar") || lower.contains("bhavan") || lower.contains("dhaba")
                || lower.contains("bakery") || lower.contains("burger") || lower.contains("pizza")) {
            category = "Food & Dining";
            bucket = "wants";
            confidence = 0.95;
        } else if (lower.contains("blinkit") || lower.contains("zepto") || lower.contains("instamart")
                || lower.contains("bigbasket") || lower.contains("kirana") || lower.contains("mart")
                || lower.contains("bazaar") || lower.contains("supermarket") || lower.contains("provisions")) {
            category = "Groceries";
            bucket = "needs";
            confidence = 0.92;
        } else if (lower.contains("uber") || lower.contains("ola") || lower.contains("rapido")
                || lower.contains("metro") || lower.contains("fuel") || lower.contains("petrol")
                || lower.contains("diesel") || lower.contains("shell") || lower.contains("hpcl")
                || lower.contains("bpcl") || lower.contains("ioc") || lower.contains("irctc")) {
            category = "Transportation";
            bucket = "needs";
            confidence = 0.94;
        } else if (lower.contains("netflix") || lower.contains("spotify") || lower.contains("youtube")
                || lower.contains("prime") || lower.contains("disney") || lower.contains("apple.com")
                || lower.contains("google play") || lower.contains("hotstar")) {
            category = "Subscriptions";
            bucket = "wants";
            isRecurring = true;
            confidence = 0.98;
        } else if (lower.contains("bescom") || lower.contains("electricity") || lower.contains("airtel")
                || lower.contains("jio") || lower.contains("broadband") || lower.contains("wifi")
                || lower.contains("water") || lower.contains("gas") || lower.contains("tata power")) {
            category = "Bills & Utilities";
            bucket = "needs";
            isRecurring = true;
            confidence = 0.96;
        } else if (lower.contains("pharma") || lower.contains("medical") || lower.contains("hospital")
                || lower.contains("clinic") || lower.contains("apollo") || lower.contains("1mg")
                || lower.contains("netmeds") || lower.contains("cult") || lower.contains("gym")) {
            category = "Health & Fitness";
            bucket = "needs";
            confidence = 0.91;
        } else if (lower.contains("amazon") || lower.contains("flipkart") || lower.contains("myntra")
                || lower.contains("ajio") || lower.contains("meesho") || lower.contains("zudio")
                || lower.contains("fashions") || lower.contains("croma")) {
            category = "Shopping";
            bucket = "wants";
            confidence = 0.90;
        } else if (lower.contains("zerodha") || lower.contains("groww") || lower.contains("upstox")
                || lower.contains("mutual fund") || lower.contains("stocks") || lower.contains("gold")) {
            category = "Investments";
            bucket = "savings";
            confidence = 0.95;
        } else if (lower.contains("rent") || lower.contains("nobroker") || lower.contains("maintenance")
                || lower.contains("mygate") || lower.contains("society")) {
            category = "Rent & Housing";
            bucket = "needs";
            isRecurring = true;
            confidence = 0.95;
        }

        return AiCategorizeResponse.builder()
                .category(category)
                .confidence(confidence)
                .suggestedBudgetBucket(bucket)
                .isRecurringSubscription(isRecurring)
                .cleanMerchant(clean)
                .build();
    }

    @Override
    public ReceiptScanResponse scanReceipt(ReceiptScanRequest request) {
        if (hasGeminiKey() && request.getImageBase64() != null && !request.getImageBase64().isEmpty()) {
            String prompt = "Extract structured financial data from this receipt. Return ONLY valid JSON with keys: " +
                    "merchant (string or null), date (YYYY-MM-DD or null), totalAmount (number or null), taxAmount (number or null), category (string or null), " +
                    "items (array of objects with name, amount, category, quantity). Do not include markdown codeblocks or backticks.";
            String rawJson = callGemini(prompt, request.getImageBase64(), request.getMimeType());
            if (rawJson != null && !rawJson.trim().isEmpty()) {
                try {
                    int startIdx = rawJson.indexOf('{');
                    int endIdx = rawJson.lastIndexOf('}');
                    String cleanJson = (startIdx != -1 && endIdx > startIdx)
                            ? rawJson.substring(startIdx, endIdx + 1)
                            : rawJson.replaceAll("```json", "").replaceAll("```", "").trim();

                    JsonNode node = objectMapper.readTree(cleanJson);
                    List<ReceiptItemDTO> items = new ArrayList<>();
                    if (node.has("items") && node.get("items").isArray()) {
                        for (JsonNode it : node.get("items")) {
                            String itemName = it.hasNonNull("name") ? it.get("name").asText("") : "";
                            double itemAmount = it.hasNonNull("amount") ? it.get("amount").asDouble(0.0) : 0.0;
                            String itemCat = it.hasNonNull("category") ? it.get("category").asText("") : "";
                            int itemQty = it.hasNonNull("quantity") ? it.get("quantity").asInt(1) : 1;

                            items.add(ReceiptItemDTO.builder()
                                    .name(itemName)
                                    .amount(itemAmount)
                                    .category(itemCat)
                                    .quantity(itemQty)
                                    .build());
                        }
                    }

                    String merchantRaw = node.hasNonNull("merchant") ? node.get("merchant").asText() : "";
                    String merchant = (!merchantRaw.isBlank() && !merchantRaw.equalsIgnoreCase("null"))
                            ? cleanMerchantName(merchantRaw)
                            : "";

                    String dateRaw = node.hasNonNull("date") ? node.get("date").asText() : "";
                    String date = (!dateRaw.isBlank() && !dateRaw.equalsIgnoreCase("null"))
                            ? dateRaw
                            : "";

                    String categoryRaw = node.hasNonNull("category") ? node.get("category").asText() : "";
                    String category = (!categoryRaw.isBlank() && !categoryRaw.equalsIgnoreCase("null"))
                            ? categoryRaw
                            : "";

                    double totalAmount = node.hasNonNull("totalAmount") ? node.get("totalAmount").asDouble(0.0) : 0.0;
                    double taxAmount = node.hasNonNull("taxAmount") ? node.get("taxAmount").asDouble(0.0) : 0.0;

                    if (totalAmount <= 0.0 && !items.isEmpty()) {
                        totalAmount = items.stream().mapToDouble(ReceiptItemDTO::getAmount).sum();
                    }

                    return ReceiptScanResponse.builder()
                            .merchant(merchant)
                            .date(date)
                            .totalAmount(totalAmount)
                            .taxAmount(taxAmount)
                            .category(category)
                            .items(items)
                            .confidence(totalAmount > 0 || !merchant.isEmpty() ? 0.95 : 0.0)
                            .build();
                } catch (Exception e) {
                    log.error("[AiService] Failed to parse Gemini vision response: {}", e.getMessage());
                }
            }
        }

        return ReceiptScanResponse.builder()
                .merchant("")
                .date("")
                .totalAmount(0.0)
                .taxAmount(0.0)
                .category("")
                .items(Collections.emptyList())
                .confidence(0.0)
                .build();
    }

    @Override
    public AiChatResponse chat(AiChatRequest request) {
        String msg = request.getMessage() != null ? request.getMessage() : "";
        String context = request.getFinancialContextSummary() != null ? request.getFinancialContextSummary() : "";

        if (hasGeminiKey()) {
            String prompt = "You are Clarity AI, a knowledgeable and private personal finance copilot. " +
                    "Answer accurately, helpfully, and concisely in 2-3 sentences based on the user's financial context.\n" +
                    "The context includes income, expenses, category spending, accounts, investments & portfolio, debts, bills, savings goals, and cashflow.\n" +
                    "Always format monetary values cleanly using the currency symbol provided in the context (e.g. ₹, $, €, £). If the user asks about something not present in the context, politely state what is known and advise accordingly.\n\n" +
                    "Financial Context:\n" + context + "\n\nUser Question: " + msg;
            String answer = callGemini(prompt, null, null);
            if (answer != null && !answer.trim().isEmpty()) {
                return AiChatResponse.builder()
                        .reply(answer.trim())
                        .suggestedAction(deriveSuggestedAction(msg))
                        .build();
            }
        }

        // Resilient deterministic fallback using real on-device context when Gemini is unavailable
        String fallbackReply = buildContextualFallbackReply(msg, context);
        return AiChatResponse.builder()
                .reply(fallbackReply)
                .suggestedAction(deriveSuggestedAction(msg))
                .build();
    }

    private String buildContextualFallbackReply(String msg, String context) {
        if (context == null || context.trim().isEmpty()) {
            return "I am currently unable to reach the AI cloud service. Please check that your network connection is active and try again.";
        }

        String lower = (msg != null ? msg : "").toLowerCase();
        Map<String, String> sections = extractContextSections(context);

        if (lower.contains("invest") || lower.contains("portfolio") || lower.contains("stock")
                || lower.contains("mutual fund") || lower.contains("sip") || lower.contains("net worth")
                || lower.contains("asset") || lower.contains("wealth")) {
            String netWorthSec = sections.get("NET WORTH & INVESTMENTS");
            if (netWorthSec != null && !netWorthSec.isEmpty()) {
                return "Based on your financial records: " + netWorthSec + ". You can track your complete asset allocation in the Investments screen.";
            }
        }

        if (lower.contains("spend") || lower.contains("expense") || lower.contains("food")
                || lower.contains("dining") || lower.contains("shopping") || lower.contains("groceries")
                || lower.contains("category")) {
            String topCat = sections.get("TOP SPENDING CATEGORIES");
            String cashflow = sections.get("MONTHLY CASHFLOW");
            if (topCat != null || cashflow != null) {
                StringBuilder sb = new StringBuilder();
                if (cashflow != null) sb.append(cashflow).append(". ");
                if (topCat != null) sb.append("Top spending: ").append(topCat).append(".");
                sb.append(" Check the Plan tab to adjust your category budgets.");
                return sb.toString();
            }
        }

        if (lower.contains("debt") || lower.contains("loan") || lower.contains("borrow")
                || lower.contains("payoff") || lower.contains("credit card")) {
            String debts = sections.get("DEBTS & LIABILITIES");
            if (debts != null && !debts.isEmpty()) {
                return "Here is your debt status: " + debts + ". Use the Debt Payoff Planner to simulate payoff strategies.";
            }
        }

        if (lower.contains("bill") || lower.contains("subscription") || lower.contains("due")
                || lower.contains("recurring")) {
            String bills = sections.get("BILLS & OBLIGATIONS");
            String recurring = sections.get("RECURRING PAYMENTS & COMMITMENTS");
            if (bills != null || recurring != null) {
                StringBuilder sb = new StringBuilder();
                if (bills != null) sb.append(bills).append(". ");
                if (recurring != null) sb.append(recurring).append(".");
                return sb.toString();
            }
        }

        if (lower.contains("safe to spend") || lower.contains("runway") || lower.contains("cashflow")
                || lower.contains("crunch") || lower.contains("payday") || lower.contains("balance")
                || lower.contains("liquid") || lower.contains("cash")) {
            String safeToSpend = sections.get("SAFE TO SPEND & RUNWAY");
            String liquidCash = sections.get("LIQUID CASH & ACCOUNTS");
            if (safeToSpend != null || liquidCash != null) {
                StringBuilder sb = new StringBuilder();
                if (safeToSpend != null) sb.append(safeToSpend).append(". ");
                if (liquidCash != null) sb.append(liquidCash).append(".");
                return sb.toString();
            }
        }

        if (lower.contains("goal") || lower.contains("save") || lower.contains("saving")
                || lower.contains("budget") || lower.contains("50/30/20")) {
            String cashflow = sections.get("MONTHLY CASHFLOW");
            String goals = sections.get("SAVINGS GOALS");
            String plan = sections.get("BUDGET PLAN");
            if (cashflow != null || goals != null || plan != null) {
                StringBuilder sb = new StringBuilder();
                if (cashflow != null) sb.append(cashflow).append(". ");
                if (goals != null) sb.append("Savings goals: ").append(goals).append(". ");
                if (plan != null) sb.append("Budget target: ").append(plan).append(".");
                return sb.toString();
            }
        }

        String cashflow = sections.get("MONTHLY CASHFLOW");
        if (cashflow != null) {
            return "Here is your monthly summary: " + cashflow + ". Feel free to ask about your investments, category spending, upcoming bills, or runway.";
        }

        return "I am currently unable to reach the AI cloud service, but your financial accounts and transactions remain safely accessible on your device.";
    }

    private Map<String, String> extractContextSections(String context) {
        Map<String, String> map = new HashMap<>();
        if (context == null) return map;
        String[] lines = context.split("\\r?\\n");
        for (String line : lines) {
            String trimmed = line.trim();
            if (trimmed.startsWith("[") && trimmed.contains("]")) {
                int endBracket = trimmed.indexOf(']');
                String key = trimmed.substring(1, endBracket).trim();
                String value = trimmed.substring(endBracket + 1).trim();
                map.put(key, value);
            }
        }
        return map;
    }

    @Override
    public VoiceParseResponse parseVoiceTransaction(VoiceParseRequest request) {
        String transcript = request.getTranscript() != null ? request.getTranscript().trim() : "";
        if (transcript.isEmpty()) {
            return VoiceParseResponse.builder()
                    .merchant("")
                    .amount(0.0)
                    .category("General")
                    .account("")
                    .type("expense")
                    .note("")
                    .confidence(0.0)
                    .build();
        }

        if (hasGeminiKey()) {
            String accountsList = (request.getAvailableAccounts() != null && !request.getAvailableAccounts().isEmpty())
                    ? String.join(", ", request.getAvailableAccounts())
                    : "None";

            String prompt = "Extract structured financial transaction data from this spoken voice input: \"" + transcript + "\".\n" +
                    "Available user accounts: [" + accountsList + "].\n" +
                    "Return ONLY valid JSON with keys: merchant (string), amount (number), category (string: Groceries, Dining, Rent, Utilities, Transport, Health, Shopping, Entertainment, Subscriptions, Travel, Salary, Personal, Transfer), account (best matching name from available user accounts or empty string), type (expense, income, or transfer), note (string). Do not include markdown codeblocks or backticks.";

            String rawJson = callGemini(prompt, null, null);
            if (rawJson != null && !rawJson.trim().isEmpty()) {
                try {
                    int startIdx = rawJson.indexOf('{');
                    int endIdx = rawJson.lastIndexOf('}');
                    String cleanJson = (startIdx != -1 && endIdx > startIdx)
                            ? rawJson.substring(startIdx, endIdx + 1)
                            : rawJson.replaceAll("```json", "").replaceAll("```", "").trim();

                    JsonNode node = objectMapper.readTree(cleanJson);
                    String merchant = node.hasNonNull("merchant") ? cleanMerchantName(node.get("merchant").asText().trim()) : "";
                    double amount = node.hasNonNull("amount") ? node.get("amount").asDouble(0.0) : 0.0;
                    String category = node.hasNonNull("category") ? node.get("category").asText("General").trim() : "General";
                    String account = node.hasNonNull("account") ? node.get("account").asText("").trim() : "";
                    String type = node.hasNonNull("type") ? node.get("type").asText("expense").toLowerCase().trim() : "expense";
                    String note = node.hasNonNull("note") ? node.get("note").asText("").trim() : "";

                    return VoiceParseResponse.builder()
                            .merchant(merchant)
                            .amount(amount)
                            .category(category)
                            .account(account)
                            .type(type)
                            .note(note)
                            .confidence(amount > 0 ? 0.95 : 0.5)
                            .build();
                } catch (Exception e) {
                    log.error("[AiService] Failed to parse voice transaction JSON: {}", e.getMessage());
                }
            }
        }

        return VoiceParseResponse.builder()
                .merchant("")
                .amount(0.0)
                .category("General")
                .account("")
                .type("expense")
                .note(transcript)
                .confidence(0.0)
                .build();
    }

    @Override
    public MonthlyDigestResponse generateDigest(MonthlyDigestRequest request) {
        double recordedIncome = sanitizeAmount(request.getTotalIncome());
        double plannedIncome = sanitizeAmount(request.getPlannedIncome());
        double effectiveIncome = Math.max(recordedIncome, plannedIncome);
        double expenses = sanitizeAmount(request.getTotalExpenses());
        String currency = (request.getCurrencySymbol() != null && !request.getCurrencySymbol().isBlank())
                ? request.getCurrencySymbol().trim()
                : "₹";

        double savings = Math.max(0.0, effectiveIncome - expenses);
        double savingsPct = effectiveIncome > 0.0 ? (savings / effectiveIncome) * 100.0 : 0.0;
        double expensePct = effectiveIncome > 0.0 ? (expenses / effectiveIncome) * 100.0 : 0.0;

        int healthScore = resolveDigestHealthScore(request.getCanonicalHealthScore(), effectiveIncome, expenses, savingsPct);

        if (hasGeminiKey() && (effectiveIncome > 0.0 || expenses > 0.0)) {
            MonthlyDigestResponse aiDigest = tryGenerateAiDigest(
                    request, effectiveIncome, expenses, savingsPct, expensePct, currency, healthScore
            );
            if (aiDigest != null) {
                return aiDigest;
            }
        }

        return buildDeterministicDigest(request, effectiveIncome, expenses, savingsPct, expensePct, currency, healthScore);
    }

    private double sanitizeAmount(Double value) {
        if (value == null || !Double.isFinite(value) || value < 0.0) {
            return 0.0;
        }
        return value;
    }

    private int resolveDigestHealthScore(
            Integer canonicalHealthScore,
            double effectiveIncome,
            double expenses,
            double savingsPct
    ) {
        if (canonicalHealthScore != null) {
            return Math.max(0, Math.min(100, canonicalHealthScore));
        }
        if (effectiveIncome <= 0.0) {
            return expenses > 0.0 ? 45 : 55;
        }
        if (expenses > effectiveIncome) {
            double overspendRatio = (expenses - effectiveIncome) / effectiveIncome;
            return (int) Math.max(25, Math.round(55.0 - Math.min(30.0, overspendRatio * 40.0)));
        }
        if (savingsPct >= 30.0) return 90;
        if (savingsPct >= 20.0) return 82;
        if (savingsPct >= 10.0) return 72;
        return 62;
    }

    private MonthlyDigestResponse tryGenerateAiDigest(
            MonthlyDigestRequest request,
            double effectiveIncome,
            double expenses,
            double savingsPct,
            double expensePct,
            String currency,
            int canonicalScore
    ) {
        String topCats = (request.getTopCategories() != null && !request.getTopCategories().isEmpty())
                ? String.join(", ", request.getTopCategories())
                : "None recorded";

        String allocationInfo = (request.getNeedsPercent() != null || request.getWantsPercent() != null || request.getSavingsPercent() != null)
                ? String.format(
                        Locale.US,
                        "Needs: %.1f%%, Wants: %.1f%%, Savings: %.1f%%",
                        request.getNeedsPercent() != null ? request.getNeedsPercent() : 0.0,
                        request.getWantsPercent() != null ? request.getWantsPercent() : 0.0,
                        request.getSavingsPercent() != null ? request.getSavingsPercent() : savingsPct
                )
                : String.format(Locale.US, "Savings rate: %.1f%%", savingsPct);

        String pillarNote = (request.getHealthSummary() != null && !request.getHealthSummary().isBlank())
                ? "Holistic 5-Pillar Health Context: " + request.getHealthSummary().trim() + "\n"
                : "";

        String prompt = String.format(
                Locale.US,
                "You are Clarity AI, a concise personal finance coach.\n" +
                "Analyze these anonymized monthly numbers for %s/%s and return ONLY valid JSON with keys: " +
                "headline (string, max 14 words), savingsAssessment (string, 1-2 sentences referencing the 50/30/20 guideline), " +
                "insights (array of 2 concise observation strings), actionableTips (array of 2-3 specific micro-action strings).\n" +
                "Always use currency symbol '%s'. Do not include markdown codeblocks or backticks.\n" +
                "Monthly Income: %s%.0f, Monthly Expenses: %s%.0f (%.1f%% of income), Net Savings Rate: %.1f%%\n" +
                "50/30/20 Allocation: %s\n" +
                "Top Categories: %s\n" +
                "Canonical Financial Health Score: %d/100\n%s",
                request.getMonth() != null ? request.getMonth() : "Current",
                request.getYear() != null ? request.getYear() : "",
                currency,
                currency, effectiveIncome,
                currency, expenses,
                expensePct,
                savingsPct,
                allocationInfo,
                topCats,
                canonicalScore,
                pillarNote
        );

        String rawJson = callGemini(prompt, null, null);
        if (rawJson == null || rawJson.isBlank()) {
            return null;
        }

        try {
            String cleanJson = extractJsonObject(rawJson);
            JsonNode node = objectMapper.readTree(cleanJson);
            String headline = node.hasNonNull("headline") ? node.get("headline").asText("").trim() : "";
            String assessment = node.hasNonNull("savingsAssessment") ? node.get("savingsAssessment").asText("").trim() : "";
            List<String> insights = extractStringList(node.get("insights"), 3);
            List<String> tips = extractStringList(node.get("actionableTips"), 3);

            if (headline.isEmpty() || assessment.isEmpty() || tips.isEmpty()) {
                return null;
            }

            return MonthlyDigestResponse.builder()
                    .headline(headline)
                    .savingsAssessment(assessment)
                    .insights(insights)
                    .actionableTips(tips)
                    .financialHealthScore(canonicalScore)
                    .build();
        } catch (Exception e) {
            log.warn("[AiService] Failed to parse Gemini monthly digest JSON, falling back: {}", e.getMessage());
            return null;
        }
    }

    private MonthlyDigestResponse buildDeterministicDigest(
            MonthlyDigestRequest request,
            double effectiveIncome,
            double expenses,
            double savingsPct,
            double expensePct,
            String currency,
            int healthScore
    ) {
        String headline;
        String assessment;

        if (effectiveIncome <= 0.0 && expenses <= 0.0) {
            headline = "No monthly income or expense activity recorded yet.";
            assessment = "Add your transactions or set a monthly budget plan to unlock personalized 50/30/20 insights.";
        } else if (effectiveIncome <= 0.0) {
            headline = String.format(Locale.US, "Recorded %s%,.0f in expenses with no income logged yet.", currency, expenses);
            assessment = "Log your income transactions or configure a monthly budget income in the Plan tab to evaluate your 50/30/20 savings rate.";
        } else if (expenses > effectiveIncome) {
            double overspentPct = expensePct - 100.0;
            headline = String.format(Locale.US, "Expenses exceeded income by %.1f%% this month.", overspentPct);
            assessment = String.format(
                    Locale.US,
                    "Spending reached %.1f%% of your %s%,.0f monthly income, leaving no room for the target 20%% savings buffer.",
                    expensePct, currency, effectiveIncome
            );
        } else if (savingsPct >= 20.0) {
            headline = String.format(Locale.US, "Great Job! You saved %.1f%% of your income this month.", savingsPct);
            assessment = "Your savings rate comfortably met the recommended 20% target under the 50/30/20 guideline.";
        } else {
            headline = String.format(Locale.US, "Active Month: You spent %.1f%% of your income and saved %.1f%%.", expensePct, savingsPct);
            assessment = "Your spending stayed within income, though discretionary wants trimmed your 20% savings target.";
        }

        List<String> insights = new ArrayList<>();
        if (effectiveIncome > 0.0) {
            insights.add(String.format(Locale.US, "Monthly expenses totaled %s%,.0f against %s%,.0f income (%.1f%% spent).",
                    currency, expenses, currency, effectiveIncome, expensePct));
        } else if (expenses > 0.0) {
            insights.add(String.format(Locale.US, "Monthly expenses totaled %s%,.0f with no recorded or planned income.", currency, expenses));
        }
        if (request.getTopCategories() != null && !request.getTopCategories().isEmpty()) {
            insights.add("Your primary spend category was " + request.getTopCategories().get(0) + ".");
        }
        if (request.getWantsPercent() != null && request.getWantsPercent() > 30.0) {
            insights.add(String.format(Locale.US, "Discretionary wants reached %.1f%% of income (50/30/20 guideline target is 30%%).",
                    request.getWantsPercent()));
        }

        List<String> tips = new ArrayList<>();
        if (effectiveIncome <= 0.0 && expenses > 0.0) {
            tips.add("Set your expected monthly income in the Plan tab or log salary inflows for accurate cashflow pacing.");
        }
        if (expenses > effectiveIncome && effectiveIncome > 0.0) {
            tips.add("Pause non-essential discretionary categories for the rest of the month to close the deficit.");
        } else if (savingsPct < 20.0 && effectiveIncome > 0.0) {
            tips.add("Automate a savings transfer right after payday to lock in your 20% savings target.");
        }
        if (request.getWantsPercent() != null && request.getWantsPercent() > 30.0) {
            tips.add("Review recurring subscriptions and dining/shopping caps in the Plan tab to bring wants back under 30%.");
        }
        if (tips.size() < 2) {
            tips.add("Review active subscriptions to eliminate unused recurring charges.");
        }
        if (tips.size() < 3) {
            tips.add("Keep emergency reserves across liquid accounts sufficient for at least 3 months of core expenses.");
        }

        return MonthlyDigestResponse.builder()
                .headline(headline)
                .savingsAssessment(assessment)
                .insights(insights)
                .actionableTips(tips)
                .financialHealthScore(healthScore)
                .build();
    }

    private String extractJsonObject(String rawJson) {
        int startIdx = rawJson.indexOf('{');
        int endIdx = rawJson.lastIndexOf('}');
        return (startIdx != -1 && endIdx > startIdx)
                ? rawJson.substring(startIdx, endIdx + 1)
                : rawJson.replaceAll("```json", "").replaceAll("```", "").trim();
    }

    private List<String> extractStringList(JsonNode arrayNode, int maxItems) {
        List<String> items = new ArrayList<>();
        if (arrayNode != null && arrayNode.isArray()) {
            for (JsonNode entry : arrayNode) {
                if (entry != null && !entry.isNull()) {
                    String text = entry.asText("").trim();
                    if (!text.isEmpty()) {
                        items.add(text);
                        if (items.size() >= maxItems) {
                            break;
                        }
                    }
                }
            }
        }
        return items;
    }

    private boolean hasGeminiKey() {
        return geminiApiKey != null && !geminiApiKey.trim().isEmpty();
    }

    private String callGemini(String prompt, String imageBase64, String mimeType) {
        if (!hasGeminiKey()) {
            return null;
        }

        String primaryModel = geminiModel != null && !geminiModel.isBlank() ? geminiModel.trim() : "gemini-flash-lite-latest";
        List<String> modelsToTry = new ArrayList<>();
        modelsToTry.add(primaryModel);
        for (String candidate : Arrays.asList("gemini-flash-lite-latest", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash")) {
            if (!modelsToTry.contains(candidate)) {
                modelsToTry.add(candidate);
            }
        }

        HttpClient client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(15))
                .build();

        for (String activeModel : modelsToTry) {
            try {
                String url = "https://generativelanguage.googleapis.com/v1beta/models/"
                        + activeModel
                        + ":generateContent?key=" + geminiApiKey.trim();

                Map<String, Object> requestBody = new HashMap<>();
                List<Map<String, Object>> contents = new ArrayList<>();
                Map<String, Object> contentMap = new HashMap<>();
                List<Map<String, Object>> parts = new ArrayList<>();

                Map<String, Object> textPart = new HashMap<>();
                textPart.put("text", prompt);
                parts.add(textPart);

                if (imageBase64 != null && !imageBase64.isEmpty()) {
                    String cleanBase64 = imageBase64;
                    if (cleanBase64.contains(",")) {
                        cleanBase64 = cleanBase64.split(",")[1];
                    }
                    cleanBase64 = cleanBase64.replaceAll("\\s+", "");

                    Map<String, Object> inlineData = new HashMap<>();
                    inlineData.put("mimeType", mimeType != null && !mimeType.isEmpty() ? mimeType : "image/jpeg");
                    inlineData.put("data", cleanBase64);

                    Map<String, Object> imagePart = new HashMap<>();
                    imagePart.put("inlineData", inlineData);
                    parts.add(imagePart);
                }

                contentMap.put("parts", parts);
                contents.add(contentMap);
                requestBody.put("contents", contents);

                Map<String, Object> generationConfig = new HashMap<>();
                generationConfig.put("temperature", 0.1);
                requestBody.put("generationConfig", generationConfig);

                String jsonPayload = objectMapper.writeValueAsString(requestBody);

                HttpRequest httpRequest = HttpRequest.newBuilder()
                        .uri(URI.create(url))
                        .header("Content-Type", "application/json")
                        .header("x-goog-api-key", geminiApiKey.trim())
                        .timeout(Duration.ofSeconds(45))
                        .POST(HttpRequest.BodyPublishers.ofString(jsonPayload))
                        .build();

                HttpResponse<String> response = client.send(httpRequest, HttpResponse.BodyHandlers.ofString());

                if (response.statusCode() == 200) {
                    JsonNode root = objectMapper.readTree(response.body());

                    JsonNode promptFeedback = root.path("promptFeedback");
                    if (promptFeedback.hasNonNull("blockReason")) {
                        log.warn("[AiService] Gemini model '{}' prompt blocked: {}", activeModel, promptFeedback.get("blockReason").asText());
                        continue;
                    }

                    JsonNode candidates = root.path("candidates");
                    if (candidates.isArray() && !candidates.isEmpty()) {
                        JsonNode candidate = candidates.get(0);
                        JsonNode responseParts = candidate.path("content").path("parts");
                        if (responseParts.isArray() && !responseParts.isEmpty()) {
                            StringBuilder answerBuilder = new StringBuilder();
                            for (JsonNode part : responseParts) {
                                boolean isThought = part.has("thought") && part.get("thought").asBoolean(false);
                                if (!isThought && part.hasNonNull("text")) {
                                    answerBuilder.append(part.get("text").asText());
                                }
                            }
                            if (answerBuilder.length() == 0) {
                                for (JsonNode part : responseParts) {
                                    if (part.hasNonNull("text")) {
                                        answerBuilder.append(part.get("text").asText());
                                    }
                                }
                            }
                            String extracted = answerBuilder.toString().trim();
                            if (!extracted.isEmpty()) {
                                return extracted;
                            }
                        }
                    }
                } else if (response.statusCode() == 429 || response.statusCode() >= 500) {
                    log.warn("[AiService] Gemini model '{}' returned HTTP {}. Attempting fallback model...",
                            activeModel, response.statusCode());
                    try {
                        Thread.sleep(300);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                    }
                } else {
                    log.error("[AiService] Gemini model '{}' returned HTTP {}: {}",
                            activeModel, response.statusCode(), response.body());
                }
            } catch (Exception e) {
                log.error("[AiService] Failed to invoke Gemini model '{}': {}", activeModel, e.getMessage());
            }
        }
        return null;
    }

    private String deriveSuggestedAction(String msg) {
        if (msg == null) return "/(app)/(tabs)/transactions";
        String lower = msg.toLowerCase();
        if (lower.contains("invest") || lower.contains("portfolio") || lower.contains("stock") ||
                lower.contains("mutual fund") || lower.contains("sip") || lower.contains("gold") ||
                lower.contains("asset") || lower.contains("holding") || lower.contains("wealth") ||
                lower.contains("net worth")) {
            return "/(app)/investments";
        }
        if (lower.contains("debt") || lower.contains("loan") || lower.contains("borrow") ||
                lower.contains("payoff") || lower.contains("snowball") || lower.contains("avalanche") ||
                lower.contains("credit card debt")) {
            return "/(app)/debt-payoff";
        }
        if (lower.contains("cashflow") || lower.contains("runway") || lower.contains("safe to spend") ||
                lower.contains("burn rate") || lower.contains("crunch") || lower.contains("payday")) {
            return "/(app)/cashflow";
        }
        if (lower.contains("health") || lower.contains("score") || lower.contains("financial health")) {
            return "/(app)/financial-health";
        }
        if (lower.contains("budget") || lower.contains("spend") || lower.contains("plan") || lower.contains("target")) {
            return "/(app)/(tabs)/plan";
        }
        if (lower.contains("bill") || lower.contains("subscription") || lower.contains("due")) {
            return "/(app)/bills";
        }
        if (lower.contains("goal") || lower.contains("save") || lower.contains("saving")) {
            return "/(app)/(tabs)/goals";
        }
        if (lower.contains("account") || lower.contains("bank") || lower.contains("balance")) {
            return "/(app)/(tabs)/accounts";
        }
        return "/(app)/(tabs)/transactions";
    }

    private String cleanMerchantName(String raw) {
        if (raw == null || raw.trim().isEmpty()) return "Unknown Vendor";
        return raw.replaceAll("(?i)^(UPI/P2A/[0-9]+/|UPI/|PAYTM\\*|BHARATPE[0-9]*\\.BPS@|RAZORPAY\\*)", "")
                .replaceAll("(?i)(/BLR|/MUM|/DEL|@.*|\\.BPS.*)$", "")
                .replace("_", " ")
                .trim();
    }
}
