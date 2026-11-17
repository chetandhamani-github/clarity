package com.clarity.splitwise.service;

import com.clarity.exception.ApiException;
import com.clarity.splitwise.dto.*;
import com.clarity.splitwise.entity.SplitDebt;
import com.clarity.splitwise.entity.SplitPerson;
import com.clarity.splitwise.entity.SplitSettlement;
import com.clarity.splitwise.repository.SplitDebtRepository;
import com.clarity.splitwise.repository.SplitPersonRepository;
import com.clarity.splitwise.repository.SplitSettlementRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class SplitwiseServiceImpl implements SplitwiseService {

    private final SplitPersonRepository splitPersonRepository;
    private final SplitDebtRepository splitDebtRepository;
    private final SplitSettlementRepository splitSettlementRepository;

    @Override
    @Transactional
    public SplitSyncResponse sync(String installationId, SplitSyncRequest request) {
        if (installationId == null || installationId.trim().isEmpty()) {
            throw new ApiException("Installation ID is required for synchronization", HttpStatus.BAD_REQUEST);
        }

        Instant syncTimestamp = Instant.now();
        Set<String> confirmedIds = new HashSet<>();
        Set<String> incomingPersonIds = new HashSet<>();
        Set<String> incomingDebtIds = new HashSet<>();
        Set<String> incomingSettlementIds = new HashSet<>();

        // 1. Process incoming people
        if (request.getPeople() != null) {
            for (SplitPersonDTO p : request.getPeople()) {
                if (p.getId() == null) continue;
                incomingPersonIds.add(p.getId());
                confirmedIds.add(p.getId());

                Instant recordUpdatedAt = parseInstant(p.getUpdatedAt(), syncTimestamp);
                Instant recordCreatedAt = parseInstant(p.getCreatedAt(), syncTimestamp);

                Optional<SplitPerson> existingOpt = splitPersonRepository.findByIdAndInstallationId(p.getId(), installationId);
                if (p.isDeleted()) {
                    if (existingOpt.isPresent()) {
                        SplitPerson person = existingOpt.get();
                        person.setDeleted(true);
                        person.setUpdatedAt(recordUpdatedAt);
                        splitPersonRepository.save(person);
                    }
                    continue;
                }

                if (p.getName() == null) continue;

                SplitPerson person = existingOpt.orElseGet(() -> SplitPerson.builder()
                        .id(p.getId())
                        .installationId(installationId)
                        .createdAt(recordCreatedAt)
                        .build());

                person.setName(p.getName());
                person.setPhone(p.getPhone());
                person.setNotes(p.getNotes());
                person.setAvatarUrl(p.getAvatarUrl());
                person.setDeleted(false);
                person.setUpdatedAt(recordUpdatedAt);

                splitPersonRepository.save(person);
            }
        }

        // 2. Process incoming debts
        if (request.getDebts() != null) {
            for (SplitDebtDTO d : request.getDebts()) {
                if (d.getId() == null) continue;
                incomingDebtIds.add(d.getId());
                confirmedIds.add(d.getId());

                Instant recordUpdatedAt = parseInstant(d.getUpdatedAt(), syncTimestamp);
                Instant recordCreatedAt = parseInstant(d.getCreatedAt(), syncTimestamp);

                Optional<SplitDebt> existingOpt = splitDebtRepository.findByIdAndInstallationId(d.getId(), installationId);
                if (d.isDeleted()) {
                    if (existingOpt.isPresent()) {
                        SplitDebt debt = existingOpt.get();
                        debt.setDeleted(true);
                        debt.setUpdatedAt(recordUpdatedAt);
                        splitDebtRepository.save(debt);
                    }
                    continue;
                }

                if (d.getPersonId() == null || d.getAmount() == null) continue;

                // Ensure person exists in database to satisfy foreign key constraint
                if (!splitPersonRepository.existsById(d.getPersonId())) {
                    SplitPerson placeholder = SplitPerson.builder()
                            .id(d.getPersonId())
                            .installationId(installationId)
                            .name("Friend")
                            .createdAt(recordCreatedAt)
                            .updatedAt(recordUpdatedAt)
                            .build();
                    splitPersonRepository.save(placeholder);
                }

                SplitDebt debt = existingOpt.orElseGet(() -> SplitDebt.builder()
                        .id(d.getId())
                        .installationId(installationId)
                        .personId(d.getPersonId())
                        .createdAt(recordCreatedAt)
                        .build());

                debt.setAmount(d.getAmount());
                debt.setType(d.getType() != null ? d.getType() : "OWE_ME");
                debt.setDescription(d.getDescription() != null ? d.getDescription() : "");
                debt.setDeleted(false);
                debt.setUpdatedAt(recordUpdatedAt);

                splitDebtRepository.save(debt);
            }
        }

        // 3. Process incoming settlements
        if (request.getSettlements() != null) {
            for (SplitSettlementDTO s : request.getSettlements()) {
                if (s.getId() == null) continue;
                incomingSettlementIds.add(s.getId());
                confirmedIds.add(s.getId());

                Instant recordUpdatedAt = parseInstant(s.getUpdatedAt(), syncTimestamp);
                Instant recordCreatedAt = parseInstant(s.getCreatedAt(), syncTimestamp);

                Optional<SplitSettlement> existingOpt = splitSettlementRepository.findByIdAndInstallationId(s.getId(), installationId);
                if (s.isDeleted()) {
                    if (existingOpt.isPresent()) {
                        SplitSettlement settlement = existingOpt.get();
                        settlement.setDeleted(true);
                        settlement.setUpdatedAt(recordUpdatedAt);
                        splitSettlementRepository.save(settlement);
                    }
                    continue;
                }

                if (s.getPersonId() == null || s.getAmount() == null) continue;

                // Ensure person exists in database to satisfy foreign key constraint
                if (!splitPersonRepository.existsById(s.getPersonId())) {
                    SplitPerson placeholder = SplitPerson.builder()
                            .id(s.getPersonId())
                            .installationId(installationId)
                            .name("Friend")
                            .createdAt(recordCreatedAt)
                            .updatedAt(recordUpdatedAt)
                            .build();
                    splitPersonRepository.save(placeholder);
                }

                SplitSettlement settlement = existingOpt.orElseGet(() -> SplitSettlement.builder()
                        .id(s.getId())
                        .installationId(installationId)
                        .personId(s.getPersonId())
                        .createdAt(recordCreatedAt)
                        .build());

                settlement.setAmount(s.getAmount());
                settlement.setSettlementType(s.getSettlementType() != null ? s.getSettlementType() : "THEY_PAID");
                settlement.setDescription(s.getDescription());
                settlement.setDeleted(false);
                settlement.setUpdatedAt(recordUpdatedAt);

                splitSettlementRepository.save(settlement);
            }
        }

        // 4. Fetch delta changes from server that client hasn't sent
        Instant since = null;
        if (request.getLastSyncedAt() != null && !request.getLastSyncedAt().trim().isEmpty()) {
            since = parseInstant(request.getLastSyncedAt(), null);
        }

        List<SplitPerson> serverPeople = (since != null)
                ? splitPersonRepository.findByInstallationIdAndUpdatedAtAfter(installationId, since)
                : splitPersonRepository.findByInstallationId(installationId);

        List<SplitDebt> serverDebts = (since != null)
                ? splitDebtRepository.findByInstallationIdAndUpdatedAtAfter(installationId, since)
                : splitDebtRepository.findByInstallationId(installationId);

        List<SplitSettlement> serverSettlements = (since != null)
                ? splitSettlementRepository.findByInstallationIdAndUpdatedAtAfter(installationId, since)
                : splitSettlementRepository.findByInstallationId(installationId);

        boolean isInitialSync = (since == null);

        List<SplitPersonDTO> deltaPeople = serverPeople.stream()
                .filter(p -> !incomingPersonIds.contains(p.getId()))
                .filter(p -> !isInitialSync || !p.isDeleted())
                .map(this::mapPerson)
                .toList();

        List<SplitDebtDTO> deltaDebts = serverDebts.stream()
                .filter(d -> !incomingDebtIds.contains(d.getId()))
                .filter(d -> !isInitialSync || !d.isDeleted())
                .map(this::mapDebt)
                .toList();

        List<SplitSettlementDTO> deltaSettlements = serverSettlements.stream()
                .filter(s -> !incomingSettlementIds.contains(s.getId()))
                .filter(s -> !isInitialSync || !s.isDeleted())
                .map(this::mapSettlement)
                .toList();

        log.info("Splitwise sync completed for installation {}: received (P:{}, D:{}, S:{}), sent delta (P:{}, D:{}, S:{})",
                installationId,
                incomingPersonIds.size(), incomingDebtIds.size(), incomingSettlementIds.size(),
                deltaPeople.size(), deltaDebts.size(), deltaSettlements.size());

        return SplitSyncResponse.builder()
                .success(true)
                .syncedAt(syncTimestamp.toString())
                .people(deltaPeople)
                .debts(deltaDebts)
                .settlements(deltaSettlements)
                .confirmedIds(new ArrayList<>(confirmedIds))
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public SplitwiseSummaryResponse getSummary(String installationId) {
        if (installationId == null || installationId.trim().isEmpty()) {
            throw new ApiException("Installation ID is required", HttpStatus.BAD_REQUEST);
        }

        long totalPeople = splitPersonRepository.countByInstallationIdAndIsDeletedFalse(installationId);
        long totalDebts = splitDebtRepository.countByInstallationIdAndIsDeletedFalse(installationId);
        long totalSettlements = splitSettlementRepository.countByInstallationIdAndIsDeletedFalse(installationId);

        List<SplitDebt> activeDebts = splitDebtRepository.findByInstallationId(installationId).stream()
                .filter(d -> !d.isDeleted())
                .toList();

        List<SplitSettlement> activeSettlements = splitSettlementRepository.findByInstallationId(installationId).stream()
                .filter(s -> !s.isDeleted())
                .toList();

        Map<String, BigDecimal> debtsOwedToMe = new HashMap<>();
        Map<String, BigDecimal> debtsIOwe = new HashMap<>();
        for (SplitDebt d : activeDebts) {
            String pid = d.getPersonId();
            if ("OWE_ME".equalsIgnoreCase(d.getType())) {
                debtsOwedToMe.put(pid, debtsOwedToMe.getOrDefault(pid, BigDecimal.ZERO).add(d.getAmount()));
            } else {
                debtsIOwe.put(pid, debtsIOwe.getOrDefault(pid, BigDecimal.ZERO).add(d.getAmount()));
            }
        }

        Map<String, BigDecimal> settledByThem = new HashMap<>();
        Map<String, BigDecimal> settledByYou = new HashMap<>();
        for (SplitSettlement s : activeSettlements) {
            String pid = s.getPersonId();
            if ("YOU_PAID".equalsIgnoreCase(s.getSettlementType())) {
                settledByYou.put(pid, settledByYou.getOrDefault(pid, BigDecimal.ZERO).add(s.getAmount()));
            } else {
                settledByThem.put(pid, settledByThem.getOrDefault(pid, BigDecimal.ZERO).add(s.getAmount()));
            }
        }

        Set<String> allPersonIds = new HashSet<>();
        allPersonIds.addAll(debtsOwedToMe.keySet());
        allPersonIds.addAll(debtsIOwe.keySet());
        allPersonIds.addAll(settledByThem.keySet());
        allPersonIds.addAll(settledByYou.keySet());

        BigDecimal totalRemainingReceivable = BigDecimal.ZERO;
        BigDecimal totalRemainingPayable = BigDecimal.ZERO;

        for (String pid : allPersonIds) {
            BigDecimal owed = debtsOwedToMe.getOrDefault(pid, BigDecimal.ZERO);
            BigDecimal iOweAmt = debtsIOwe.getOrDefault(pid, BigDecimal.ZERO);
            BigDecimal sThem = settledByThem.getOrDefault(pid, BigDecimal.ZERO);
            BigDecimal sYou = settledByYou.getOrDefault(pid, BigDecimal.ZERO);

            BigDecimal remReceivable = owed.subtract(sThem).max(BigDecimal.ZERO);
            BigDecimal remPayable = iOweAmt.subtract(sYou).max(BigDecimal.ZERO);

            totalRemainingReceivable = totalRemainingReceivable.add(remReceivable);
            totalRemainingPayable = totalRemainingPayable.add(remPayable);
        }

        return SplitwiseSummaryResponse.builder()
                .totalPeople(totalPeople)
                .totalDebts(totalDebts)
                .totalSettlements(totalSettlements)
                .totalOwedToMe(totalRemainingReceivable)
                .totalIOwe(totalRemainingPayable)
                .netBalance(totalRemainingReceivable.subtract(totalRemainingPayable))
                .build();
    }

    private Instant parseInstant(String text, Instant fallback) {
        if (text == null || text.trim().isEmpty()) return fallback;
        try {
            String formatted = text.trim();
            // Handle SQLite format "YYYY-MM-DD HH:MM:SS"
            if (formatted.contains(" ") && !formatted.contains("T")) {
                formatted = formatted.replace(" ", "T");
            }
            if (!formatted.endsWith("Z") && !formatted.contains("+") && !formatted.matches(".*[+-]\\d{2}:?\\d{2}$")) {
                formatted = formatted + "Z";
            }
            return Instant.parse(formatted);
        } catch (DateTimeParseException e) {
            return fallback != null ? fallback : Instant.now();
        }
    }

    private SplitPersonDTO mapPerson(SplitPerson p) {
        return SplitPersonDTO.builder()
                .id(p.getId())
                .name(p.getName())
                .phone(p.getPhone())
                .notes(p.getNotes())
                .avatarUrl(p.getAvatarUrl())
                .isDeleted(p.isDeleted())
                .createdAt(p.getCreatedAt() != null ? p.getCreatedAt().toString() : null)
                .updatedAt(p.getUpdatedAt() != null ? p.getUpdatedAt().toString() : null)
                .build();
    }

    private SplitDebtDTO mapDebt(SplitDebt d) {
        return SplitDebtDTO.builder()
                .id(d.getId())
                .personId(d.getPersonId())
                .amount(d.getAmount())
                .type(d.getType())
                .description(d.getDescription())
                .isDeleted(d.isDeleted())
                .createdAt(d.getCreatedAt() != null ? d.getCreatedAt().toString() : null)
                .updatedAt(d.getUpdatedAt() != null ? d.getUpdatedAt().toString() : null)
                .build();
    }

    private SplitSettlementDTO mapSettlement(SplitSettlement s) {
        return SplitSettlementDTO.builder()
                .id(s.getId())
                .personId(s.getPersonId())
                .amount(s.getAmount())
                .settlementType(s.getSettlementType())
                .description(s.getDescription())
                .isDeleted(s.isDeleted())
                .createdAt(s.getCreatedAt() != null ? s.getCreatedAt().toString() : null)
                .updatedAt(s.getUpdatedAt() != null ? s.getUpdatedAt().toString() : null)
                .build();
    }
}
