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
        String msg = request.getMessage();
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

        return AiChatResponse.builder()
                .reply("I am unable to process your request at the moment. Please try again later.")
                .suggestedAction(deriveSuggestedAction(msg))
                .build();
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
        double income = request.getTotalIncome() != null ? request.getTotalIncome() : 0.0;
        double expenses = request.getTotalExpenses() != null ? request.getTotalExpenses() : 0.0;
        double savings = Math.max(0, income - expenses);
        double savingsPct = income > 0 ? (savings / income) * 100 : 0.0;

        int healthScore = 70;
        if (savingsPct >= 20.0) healthScore += 15;
        if (savingsPct >= 30.0) healthScore += 10;
        if (expenses > income) healthScore = 45;

        String headline = savingsPct >= 20.0
                ? String.format("Great Job! You saved %.1f%% of your income this month.", savingsPct)
                : String.format("Active Month: You spent %.1f%% of your total income.", 100.0 - savingsPct);

        String assessment = savingsPct >= 20.0
                ? "Your savings rate comfortably met the recommended 20% target under the 50/30/20 guideline."
                : "Your discretionary spending cut into your target 20% savings margin. Consider pruning non-essential wants.";

        List<String> insights = new ArrayList<>();
        insights.add(String.format("Total monthly expenses came to ₹%,.0f against ₹%,.0f income.", expenses, income));
        if (request.getTopCategories() != null && !request.getTopCategories().isEmpty()) {
            insights.add("Your primary spend category was " + request.getTopCategories().get(0) + ".");
        }

        List<String> tips = Arrays.asList(
                "Review active subscriptions to eliminate unused memberships.",
                "Automate savings contributions on the 1st of each month to lock in your 20% target.",
                "Use UPI statement sync regularly to capture small micro-spends."
        );

        return MonthlyDigestResponse.builder()
                .headline(headline)
                .savingsAssessment(assessment)
                .insights(insights)
                .actionableTips(tips)
                .financialHealthScore(healthScore)
                .build();
    }

    private boolean hasGeminiKey() {
        return geminiApiKey != null && !geminiApiKey.trim().isEmpty();
    }

    private String callGemini(String prompt, String imageBase64, String mimeType) {
        if (!hasGeminiKey()) {
            return null;
        }

        try {
            String activeModel = geminiModel != null && !geminiModel.isBlank() ? geminiModel.trim() : "gemini-flash-lite-latest";
            if (activeModel.contains("1.5") || activeModel.contains("2.5") || activeModel.equals("gemini-flash-latest")) {
                activeModel = "gemini-flash-lite-latest";
            }
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

            HttpClient client = HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(15))
                    .build();

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
                JsonNode candidates = root.path("candidates");
                if (candidates.isArray() && !candidates.isEmpty()) {
                    JsonNode textNode = candidates.get(0).path("content").path("parts").get(0).path("text");
                    return textNode.asText();
                }
            }
        } catch (Exception e) {
            log.error("[AiService] Failed to invoke Gemini API: {}", e.getMessage());
        }
        return null;
    }

    private String deriveSuggestedAction(String msg) {
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
