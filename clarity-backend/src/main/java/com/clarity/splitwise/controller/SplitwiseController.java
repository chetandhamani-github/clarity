package com.clarity.splitwise.controller;

import com.clarity.splitwise.dto.SplitSyncRequest;
import com.clarity.splitwise.dto.SplitSyncResponse;
import com.clarity.splitwise.dto.SplitwiseSummaryResponse;
import com.clarity.splitwise.service.SplitwiseService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/splitwise")
@RequiredArgsConstructor
@Tag(name = "Splitwise", description = "Splitwise shared expenses and debt synchronization endpoints")
public class SplitwiseController {

    private final SplitwiseService splitwiseService;

    @PostMapping("/sync")
    @Operation(summary = "Synchronize splitwise records",
            description = "Bidirectional synchronization: pushes client people, debts, and settlements to backend, and returns server deltas")
    public ResponseEntity<SplitSyncResponse> sync(
            @Parameter(description = "Device installation ID")
            @RequestHeader(value = "X-Installation-Id", required = false) String installationIdHeader,
            @Parameter(description = "User authentication bearer token")
            @RequestHeader(value = "Authorization", required = false) String authHeader,
            @RequestBody SplitSyncRequest request) {

        String installationId = (installationIdHeader != null && !installationIdHeader.trim().isEmpty())
                ? installationIdHeader.trim()
                : (request.getInstallationId() != null ? request.getInstallationId().trim() : null);

        SplitSyncResponse response = splitwiseService.sync(installationId, request, authHeader);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/summary")
    @Operation(summary = "Get Splitwise summary stats for device",
            description = "Returns count of people, debts, settlements, and net balance")
    public ResponseEntity<SplitwiseSummaryResponse> getSummary(
            @Parameter(description = "Device installation ID", required = true)
            @RequestHeader("X-Installation-Id") String installationId) {

        SplitwiseSummaryResponse summary = splitwiseService.getSummary(installationId);
        return ResponseEntity.ok(summary);
    }
}
