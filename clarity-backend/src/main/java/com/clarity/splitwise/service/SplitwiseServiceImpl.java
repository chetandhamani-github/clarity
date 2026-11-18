package com.clarity.splitwise.service;

import com.clarity.auth.entity.User;
import com.clarity.auth.repository.UserRepository;
import com.clarity.exception.ApiException;
import com.clarity.splitwise.dto.*;
import com.clarity.splitwise.entity.*;
import com.clarity.splitwise.repository.*;
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
    private final SplitGroupRepository splitGroupRepository;
    private final SplitGroupMemberRepository splitGroupMemberRepository;
    private final SplitExpenseRepository splitExpenseRepository;
    private final SplitExpenseSplitRepository splitExpenseSplitRepository;
    private final UserRepository userRepository;

    @Override
    @Transactional
    public SplitSyncResponse sync(String installationId, SplitSyncRequest request) {
        return sync(installationId, request, null);
    }

    @Override
    @Transactional
    public SplitSyncResponse sync(String installationId, SplitSyncRequest request, String authHeader) {
        if (installationId == null || installationId.trim().isEmpty()) {
            throw new ApiException("Installation ID is required for synchronization", HttpStatus.BAD_REQUEST);
        }

        // 0. Extract current authenticated user if Authorization token is provided
        String currentUserEmail = null;
        String currentUserName = null;
        if (authHeader != null && !authHeader.trim().isEmpty()) {
            String token = authHeader.trim().startsWith("Bearer ")
                    ? authHeader.trim().substring(7).trim()
                    : authHeader.trim();
            Optional<User> userOpt = userRepository.findByAuthToken(token);
            if (userOpt.isPresent()) {
                currentUserEmail = userOpt.get().getEmail().toLowerCase().trim();
                currentUserName = userOpt.get().getName();
            }
        }

        Instant syncTimestamp = Instant.now();
        Set<String> confirmedIds = new HashSet<>();
        Set<String> incomingPersonIds = new HashSet<>();
        Set<String> incomingDebtIds = new HashSet<>();
        Set<String> incomingSettlementIds = new HashSet<>();
        Set<String> incomingGroupIds = new HashSet<>();
        Set<String> incomingExpenseIds = new HashSet<>();
        Map<String, String> personEmailMap = new HashMap<>();

        // 1. Process incoming people
        if (request.getPeople() != null) {
            for (SplitPersonDTO p : request.getPeople()) {
                if (p.getId() == null) continue;
                incomingPersonIds.add(p.getId());
                confirmedIds.add(p.getId());

                Instant recordUpdatedAt = parseInstant(p.getUpdatedAt(), syncTimestamp);
                Instant recordCreatedAt = parseInstant(p.getCreatedAt(), syncTimestamp);

                String personEmail = p.getEmail() != null ? p.getEmail().trim().toLowerCase() : null;
                if (personEmail != null && !personEmail.isEmpty()) {
                    personEmailMap.put(p.getId(), personEmail);
                }

                Optional<SplitPerson> existingOpt = findAuthorizedPerson(p.getId(), installationId, currentUserEmail);
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
                person.setEmail(personEmail);
                person.setOwnerEmail(currentUserEmail);
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

                // Determine friend's email
                String friendEmail = d.getFriendEmail() != null ? d.getFriendEmail().trim().toLowerCase() : personEmailMap.get(d.getPersonId());
                if (friendEmail == null) {
                    friendEmail = splitPersonRepository.findById(d.getPersonId()).map(SplitPerson::getEmail).orElse(null);
                }

                Optional<SplitDebt> existingOpt = findAuthorizedDebt(d.getId(), installationId, currentUserEmail);
                if (d.isDeleted()) {
                    if (existingOpt.isPresent()) {
                        SplitDebt debt = existingOpt.get();
                        debt.setDeleted(true);
                        debt.setUpdatedAt(recordUpdatedAt);
                        splitDebtRepository.save(debt);
                    }
                    // Also soft-delete inverse mirrored debt if present
                    if (currentUserEmail != null && friendEmail != null) {
                        splitDebtRepository.findById(getInverseId(d.getId())).ifPresent(invDebt -> {
                            invDebt.setDeleted(true);
                            invDebt.setUpdatedAt(recordUpdatedAt);
                            splitDebtRepository.save(invDebt);
                        });
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
                            .email(friendEmail)
                            .ownerEmail(currentUserEmail)
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
                debt.setFriendEmail(friendEmail);
                debt.setOwnerEmail(currentUserEmail);
                debt.setDeleted(false);
                debt.setUpdatedAt(recordUpdatedAt);

                splitDebtRepository.save(debt);

                // 2.1 Collaborative Auto-Mirroring for the friend
                if (currentUserEmail != null && friendEmail != null && !friendEmail.equalsIgnoreCase(currentUserEmail)) {
                    mirrorDebtForFriend(currentUserEmail, currentUserName, friendEmail, d, recordCreatedAt, recordUpdatedAt);
                }
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

                String friendEmail = s.getFriendEmail() != null ? s.getFriendEmail().trim().toLowerCase() : personEmailMap.get(s.getPersonId());
                if (friendEmail == null) {
                    friendEmail = splitPersonRepository.findById(s.getPersonId()).map(SplitPerson::getEmail).orElse(null);
                }

                Optional<SplitSettlement> existingOpt = findAuthorizedSettlement(s.getId(), installationId, currentUserEmail);
                if (s.isDeleted()) {
                    if (existingOpt.isPresent()) {
                        SplitSettlement settlement = existingOpt.get();
                        settlement.setDeleted(true);
                        settlement.setUpdatedAt(recordUpdatedAt);
                        splitSettlementRepository.save(settlement);
                    }
                    if (currentUserEmail != null && friendEmail != null) {
                        splitSettlementRepository.findById(getInverseId(s.getId())).ifPresent(invSettlement -> {
                            invSettlement.setDeleted(true);
                            invSettlement.setUpdatedAt(recordUpdatedAt);
                            splitSettlementRepository.save(invSettlement);
                        });
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
                            .email(friendEmail)
                            .ownerEmail(currentUserEmail)
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
                settlement.setFriendEmail(friendEmail);
                settlement.setOwnerEmail(currentUserEmail);
                settlement.setDeleted(false);
                settlement.setUpdatedAt(recordUpdatedAt);

                splitSettlementRepository.save(settlement);

                // 3.1 Collaborative Auto-Mirroring for the friend's settlement
                if (currentUserEmail != null && friendEmail != null && !friendEmail.equalsIgnoreCase(currentUserEmail)) {
                    mirrorSettlementForFriend(currentUserEmail, currentUserName, friendEmail, s, recordCreatedAt, recordUpdatedAt);
                }
            }
        }

        // 4. Process incoming groups
        if (request.getGroups() != null) {
            for (SplitGroupDTO g : request.getGroups()) {
                if (g.getId() == null) continue;
                incomingGroupIds.add(g.getId());
                confirmedIds.add(g.getId());

                Instant recordUpdatedAt = parseInstant(g.getUpdatedAt(), syncTimestamp);
                Instant recordCreatedAt = parseInstant(g.getCreatedAt(), syncTimestamp);

                Optional<SplitGroup> existingOpt = splitGroupRepository.findById(g.getId());
                if (g.isDeleted()) {
                    if (existingOpt.isPresent()) {
                        SplitGroup group = existingOpt.get();
                        group.setDeleted(true);
                        group.setUpdatedAt(recordUpdatedAt);
                        splitGroupRepository.save(group);
                    }
                    continue;
                }

                SplitGroup group = existingOpt.orElseGet(() -> SplitGroup.builder()
                        .id(g.getId())
                        .installationId(installationId)
                        .createdAt(recordCreatedAt)
                        .build());

                group.setName(g.getName() != null ? g.getName() : "Group");
                group.setDescription(g.getDescription());
                group.setIcon(g.getIcon());
                group.setCategory(g.getCategory());
                group.setCurrency(g.getCurrency() != null ? g.getCurrency() : "INR");
                group.setOwnerEmail(currentUserEmail);
                group.setArchived(g.isArchived());
                group.setDeleted(false);
                group.setUpdatedAt(recordUpdatedAt);

                splitGroupRepository.save(group);

                // Members
                if (g.getMemberIds() != null) {
                    splitGroupMemberRepository.deleteByGroupId(g.getId());
                    for (String memberPersonId : g.getMemberIds()) {
                        SplitGroupMember member = SplitGroupMember.builder()
                                .id(UUID.randomUUID().toString())
                                .groupId(g.getId())
                                .personId(memberPersonId)
                                .role("member")
                                .joinedAt(recordCreatedAt)
                                .build();
                        splitGroupMemberRepository.save(member);
                    }
                }
            }
        }

        // 5. Process incoming expenses
        if (request.getExpenses() != null) {
            for (SplitExpenseDTO e : request.getExpenses()) {
                if (e.getId() == null) continue;
                incomingExpenseIds.add(e.getId());
                confirmedIds.add(e.getId());

                Instant recordUpdatedAt = parseInstant(e.getUpdatedAt(), syncTimestamp);
                Instant recordCreatedAt = parseInstant(e.getCreatedAt(), syncTimestamp);

                Optional<SplitExpense> existingOpt = splitExpenseRepository.findById(e.getId());
                if (e.isDeleted()) {
                    if (existingOpt.isPresent()) {
                        SplitExpense exp = existingOpt.get();
                        exp.setDeleted(true);
                        exp.setUpdatedAt(recordUpdatedAt);
                        splitExpenseRepository.save(exp);
                    }
                    continue;
                }

                SplitExpense exp = existingOpt.orElseGet(() -> SplitExpense.builder()
                        .id(e.getId())
                        .installationId(installationId)
                        .createdAt(recordCreatedAt)
                        .build());

                exp.setDescription(e.getDescription() != null ? e.getDescription() : "Expense");
                exp.setAmount(e.getAmount() != null ? e.getAmount() : BigDecimal.ZERO);
                exp.setCurrency(e.getCurrency() != null ? e.getCurrency() : "INR");
                exp.setCategory(e.getCategory());
                exp.setDate(parseInstant(e.getDate(), recordCreatedAt));
                exp.setPayerId(e.getPayerId());
                exp.setGroupId(e.getGroupId());
                exp.setSplitType(e.getSplitType() != null ? e.getSplitType() : "EQUAL");
                exp.setNotes(e.getNotes());
                exp.setReceiptUrl(e.getReceiptUrl());
                exp.setOwnerEmail(currentUserEmail);
                exp.setDeleted(false);
                exp.setUpdatedAt(recordUpdatedAt);

                splitExpenseRepository.save(exp);

                // Splits
                if (e.getSplits() != null) {
                    splitExpenseSplitRepository.deleteByExpenseId(e.getId());
                    for (SplitExpenseSplitDTO s : e.getSplits()) {
                        SplitExpenseSplit split = SplitExpenseSplit.builder()
                                .id(s.getId() != null ? s.getId() : UUID.randomUUID().toString())
                                .expenseId(e.getId())
                                .personId(s.getPersonId())
                                .paidAmount(s.getPaidAmount() != null ? s.getPaidAmount() : BigDecimal.ZERO)
                                .owedAmount(s.getOwedAmount() != null ? s.getOwedAmount() : BigDecimal.ZERO)
                                .percentage(s.getPercentage())
                                .shares(s.getShares())
                                .isPaid(s.isPaid())
                                .createdAt(recordCreatedAt)
                                .build();
                        splitExpenseSplitRepository.save(split);
                    }
                }
            }
        }

        // 6. Calculate delta responses to return to client
        Instant since = null;
        if (request.getLastSyncedAt() != null && !request.getLastSyncedAt().trim().isEmpty()) {
            since = parseInstant(request.getLastSyncedAt(), null);
        }

        Map<String, SplitPerson> serverPeopleMap = new LinkedHashMap<>();
        Map<String, SplitDebt> serverDebtsMap = new LinkedHashMap<>();
        Map<String, SplitSettlement> serverSettlementsMap = new LinkedHashMap<>();
        Map<String, SplitGroup> serverGroupsMap = new LinkedHashMap<>();
        Map<String, SplitExpense> serverExpensesMap = new LinkedHashMap<>();

        // By installation ID
        List<SplitPerson> pInst = (since != null)
                ? splitPersonRepository.findByInstallationIdAndUpdatedAtAfter(installationId, since)
                : splitPersonRepository.findByInstallationId(installationId);
        pInst.forEach(p -> serverPeopleMap.put(p.getId(), p));

        List<SplitDebt> dInst = (since != null)
                ? splitDebtRepository.findByInstallationIdAndUpdatedAtAfter(installationId, since)
                : splitDebtRepository.findByInstallationId(installationId);
        dInst.forEach(d -> serverDebtsMap.put(d.getId(), d));

        List<SplitSettlement> sInst = (since != null)
                ? splitSettlementRepository.findByInstallationIdAndUpdatedAtAfter(installationId, since)
                : splitSettlementRepository.findByInstallationId(installationId);
        sInst.forEach(s -> serverSettlementsMap.put(s.getId(), s));

        List<SplitGroup> gInst = (since != null)
                ? splitGroupRepository.findByInstallationIdAndUpdatedAtAfter(installationId, since)
                : splitGroupRepository.findByInstallationId(installationId);
        gInst.forEach(g -> serverGroupsMap.put(g.getId(), g));

        List<SplitExpense> expInst = (since != null)
                ? splitExpenseRepository.findByInstallationIdAndUpdatedAtAfter(installationId, since)
                : splitExpenseRepository.findByInstallationId(installationId);
        expInst.forEach(e -> serverExpensesMap.put(e.getId(), e));

        // By authenticated owner email (collaborative updates)
        if (currentUserEmail != null) {
            List<SplitPerson> pEmail = (since != null)
                    ? splitPersonRepository.findByOwnerEmailAndUpdatedAtAfter(currentUserEmail, since)
                    : splitPersonRepository.findByOwnerEmail(currentUserEmail);
            pEmail.forEach(p -> serverPeopleMap.put(p.getId(), p));

            List<SplitDebt> dEmail = (since != null)
                    ? splitDebtRepository.findByOwnerEmailAndUpdatedAtAfter(currentUserEmail, since)
                    : splitDebtRepository.findByOwnerEmail(currentUserEmail);
            dEmail.forEach(d -> serverDebtsMap.put(d.getId(), d));

            List<SplitSettlement> sEmail = (since != null)
                    ? splitSettlementRepository.findByOwnerEmailAndUpdatedAtAfter(currentUserEmail, since)
                    : splitSettlementRepository.findByOwnerEmail(currentUserEmail);
            sEmail.forEach(s -> serverSettlementsMap.put(s.getId(), s));

            List<SplitGroup> gEmail = (since != null)
                    ? splitGroupRepository.findByOwnerEmailAndUpdatedAtAfter(currentUserEmail, since)
                    : splitGroupRepository.findByOwnerEmail(currentUserEmail);
            gEmail.forEach(g -> serverGroupsMap.put(g.getId(), g));

            List<SplitExpense> expEmail = (since != null)
                    ? splitExpenseRepository.findByOwnerEmailAndUpdatedAtAfter(currentUserEmail, since)
                    : splitExpenseRepository.findByOwnerEmail(currentUserEmail);
            expEmail.forEach(e -> serverExpensesMap.put(e.getId(), e));
        }

        boolean isInitialSync = (since == null);

        List<SplitPersonDTO> deltaPeople = serverPeopleMap.values().stream()
                .filter(p -> !incomingPersonIds.contains(p.getId()))
                .filter(p -> !isInitialSync || !p.isDeleted())
                .map(this::mapPerson)
                .toList();

        List<SplitDebtDTO> deltaDebts = serverDebtsMap.values().stream()
                .filter(d -> !incomingDebtIds.contains(d.getId()))
                .filter(d -> !isInitialSync || !d.isDeleted())
                .map(this::mapDebt)
                .toList();

        List<SplitSettlementDTO> deltaSettlements = serverSettlementsMap.values().stream()
                .filter(s -> !incomingSettlementIds.contains(s.getId()))
                .filter(s -> !isInitialSync || !s.isDeleted())
                .map(this::mapSettlement)
                .toList();

        List<SplitGroupDTO> deltaGroups = serverGroupsMap.values().stream()
                .filter(g -> !incomingGroupIds.contains(g.getId()))
                .filter(g -> !isInitialSync || !g.isDeleted())
                .map(this::mapGroup)
                .toList();

        List<SplitExpenseDTO> deltaExpenses = serverExpensesMap.values().stream()
                .filter(e -> !incomingExpenseIds.contains(e.getId()))
                .filter(e -> !isInitialSync || !e.isDeleted())
                .map(this::mapExpense)
                .toList();

        log.info("Splitwise sync completed for installation {} / user {}: received (P:{}, D:{}, S:{}, G:{}, E:{}), sent delta (P:{}, D:{}, S:{}, G:{}, E:{})",
                installationId, currentUserEmail, incomingPersonIds.size(), incomingDebtIds.size(), incomingSettlementIds.size(),
                incomingGroupIds.size(), incomingExpenseIds.size(),
                deltaPeople.size(), deltaDebts.size(), deltaSettlements.size(), deltaGroups.size(), deltaExpenses.size());

        return SplitSyncResponse.builder()
                .success(true)
                .syncedAt(syncTimestamp.toString())
                .people(deltaPeople)
                .debts(deltaDebts)
                .settlements(deltaSettlements)
                .groups(deltaGroups)
                .expenses(deltaExpenses)
                .confirmedIds(new ArrayList<>(confirmedIds))
                .build();
    }

    private Optional<SplitPerson> findAuthorizedPerson(String id, String installationId, String currentUserEmail) {
        return splitPersonRepository.findById(id)
                .filter(p -> installationId.equals(p.getInstallationId())
                        || (currentUserEmail != null && currentUserEmail.equalsIgnoreCase(p.getOwnerEmail())));
    }

    private Optional<SplitDebt> findAuthorizedDebt(String id, String installationId, String currentUserEmail) {
        return splitDebtRepository.findById(id)
                .filter(d -> installationId.equals(d.getInstallationId())
                        || (currentUserEmail != null && currentUserEmail.equalsIgnoreCase(d.getOwnerEmail())));
    }

    private Optional<SplitSettlement> findAuthorizedSettlement(String id, String installationId, String currentUserEmail) {
        return splitSettlementRepository.findById(id)
                .filter(s -> installationId.equals(s.getInstallationId())
                        || (currentUserEmail != null && currentUserEmail.equalsIgnoreCase(s.getOwnerEmail())));
    }

    private String getInverseId(String id) {
        if (id == null) return null;
        return id.endsWith("_inv") ? id.substring(0, id.length() - 4) : id + "_inv";
    }

    private void mirrorDebtForFriend(String userEmail, String userName, String friendEmail,
                                     SplitDebtDTO originalDebt, Instant createdAt, Instant updatedAt) {
        try {
            // Reuse existing contact for friend if already present, otherwise create inverse contact
            String inverseContactId = splitPersonRepository.findByOwnerEmailAndEmail(friendEmail, userEmail)
                    .map(SplitPerson::getId)
                    .orElseGet(() -> {
                        String id = "p_collab_" + Math.abs((friendEmail + "_" + userEmail).hashCode());
                        if (!splitPersonRepository.existsById(id)) {
                            String displayName = userName != null && !userName.trim().isEmpty()
                                    ? userName
                                    : userEmail.split("@")[0];
                            SplitPerson inverseContact = SplitPerson.builder()
                                    .id(id)
                                    .installationId("user_" + friendEmail)
                                    .name(displayName)
                                    .email(userEmail)
                                    .ownerEmail(friendEmail)
                                    .createdAt(createdAt)
                                    .updatedAt(updatedAt)
                                    .build();
                            splitPersonRepository.save(inverseContact);
                        }
                        return id;
                    });

            String inverseDebtId = getInverseId(originalDebt.getId());
            String inverseType = "OWE_ME".equalsIgnoreCase(originalDebt.getType()) ? "I_OWE" : "OWE_ME";

            SplitDebt inverseDebt = splitDebtRepository.findById(inverseDebtId)
                    .orElseGet(() -> SplitDebt.builder()
                            .id(inverseDebtId)
                            .installationId("user_" + friendEmail)
                            .personId(inverseContactId)
                            .createdAt(createdAt)
                            .build());

            inverseDebt.setPersonId(inverseContactId);
            inverseDebt.setAmount(originalDebt.getAmount());
            inverseDebt.setType(inverseType);
            inverseDebt.setDescription(originalDebt.getDescription() != null ? originalDebt.getDescription() : "");
            inverseDebt.setFriendEmail(userEmail);
            inverseDebt.setOwnerEmail(friendEmail);
            inverseDebt.setDeleted(originalDebt.isDeleted());
            inverseDebt.setUpdatedAt(updatedAt);

            splitDebtRepository.save(inverseDebt);
            log.info("Mirrored collaborative debt {} for friend {}", inverseDebtId, friendEmail);
        } catch (Exception e) {
            log.error("Failed to mirror debt for friend {}: {}", friendEmail, e.getMessage());
        }
    }

    private void mirrorSettlementForFriend(String userEmail, String userName, String friendEmail,
                                           SplitSettlementDTO originalSettlement, Instant createdAt, Instant updatedAt) {
        try {
            // Reuse existing contact for friend if already present, otherwise create inverse contact
            String inverseContactId = splitPersonRepository.findByOwnerEmailAndEmail(friendEmail, userEmail)
                    .map(SplitPerson::getId)
                    .orElseGet(() -> {
                        String id = "p_collab_" + Math.abs((friendEmail + "_" + userEmail).hashCode());
                        if (!splitPersonRepository.existsById(id)) {
                            String displayName = userName != null && !userName.trim().isEmpty()
                                    ? userName
                                    : userEmail.split("@")[0];
                            SplitPerson inverseContact = SplitPerson.builder()
                                    .id(id)
                                    .installationId("user_" + friendEmail)
                                    .name(displayName)
                                    .email(userEmail)
                                    .ownerEmail(friendEmail)
                                    .createdAt(createdAt)
                                    .updatedAt(updatedAt)
                                    .build();
                            splitPersonRepository.save(inverseContact);
                        }
                        return id;
                    });

            String inverseSettlementId = getInverseId(originalSettlement.getId());
            String inverseSettlementType = "THEY_PAID".equalsIgnoreCase(originalSettlement.getSettlementType())
                    ? "YOU_PAID"
                    : "THEY_PAID";

            SplitSettlement inverseSettlement = splitSettlementRepository.findById(inverseSettlementId)
                    .orElseGet(() -> SplitSettlement.builder()
                            .id(inverseSettlementId)
                            .installationId("user_" + friendEmail)
                            .personId(inverseContactId)
                            .createdAt(createdAt)
                            .build());

            inverseSettlement.setPersonId(inverseContactId);
            inverseSettlement.setAmount(originalSettlement.getAmount());
            inverseSettlement.setSettlementType(inverseSettlementType);
            inverseSettlement.setDescription(originalSettlement.getDescription());
            inverseSettlement.setFriendEmail(userEmail);
            inverseSettlement.setOwnerEmail(friendEmail);
            inverseSettlement.setDeleted(originalSettlement.isDeleted());
            inverseSettlement.setUpdatedAt(updatedAt);

            splitSettlementRepository.save(inverseSettlement);
            log.info("Mirrored collaborative settlement {} for friend {}", inverseSettlementId, friendEmail);
        } catch (Exception e) {
            log.error("Failed to mirror settlement for friend {}: {}", friendEmail, e.getMessage());
        }
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
                .email(p.getEmail())
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
                .friendEmail(d.getFriendEmail())
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
                .friendEmail(s.getFriendEmail())
                .amount(s.getAmount())
                .settlementType(s.getSettlementType())
                .description(s.getDescription())
                .isDeleted(s.isDeleted())
                .createdAt(s.getCreatedAt() != null ? s.getCreatedAt().toString() : null)
                .updatedAt(s.getUpdatedAt() != null ? s.getUpdatedAt().toString() : null)
                .build();
    }

    private SplitGroupDTO mapGroup(SplitGroup g) {
        List<String> memberIds = splitGroupMemberRepository.findByGroupId(g.getId()).stream()
                .map(SplitGroupMember::getPersonId)
                .toList();

        return SplitGroupDTO.builder()
                .id(g.getId())
                .name(g.getName())
                .description(g.getDescription())
                .icon(g.getIcon())
                .category(g.getCategory())
                .currency(g.getCurrency())
                .ownerEmail(g.getOwnerEmail())
                .memberIds(memberIds)
                .isArchived(g.isArchived())
                .isDeleted(g.isDeleted())
                .createdAt(g.getCreatedAt() != null ? g.getCreatedAt().toString() : null)
                .updatedAt(g.getUpdatedAt() != null ? g.getUpdatedAt().toString() : null)
                .build();
    }

    private SplitExpenseDTO mapExpense(SplitExpense e) {
        List<SplitExpenseSplitDTO> splits = splitExpenseSplitRepository.findByExpenseId(e.getId()).stream()
                .map(s -> SplitExpenseSplitDTO.builder()
                        .id(s.getId())
                        .expenseId(s.getExpenseId())
                        .personId(s.getPersonId())
                        .paidAmount(s.getPaidAmount())
                        .owedAmount(s.getOwedAmount())
                        .percentage(s.getPercentage())
                        .shares(s.getShares())
                        .isPaid(s.isPaid())
                        .createdAt(s.getCreatedAt() != null ? s.getCreatedAt().toString() : null)
                        .build())
                .toList();

        return SplitExpenseDTO.builder()
                .id(e.getId())
                .groupId(e.getGroupId())
                .payerId(e.getPayerId())
                .description(e.getDescription())
                .amount(e.getAmount())
                .currency(e.getCurrency())
                .category(e.getCategory())
                .date(e.getDate() != null ? e.getDate().toString() : null)
                .splitType(e.getSplitType())
                .notes(e.getNotes())
                .receiptUrl(e.getReceiptUrl())
                .ownerEmail(e.getOwnerEmail())
                .splits(splits)
                .isDeleted(e.isDeleted())
                .createdAt(e.getCreatedAt() != null ? e.getCreatedAt().toString() : null)
                .updatedAt(e.getUpdatedAt() != null ? e.getUpdatedAt().toString() : null)
                .build();
    }
}
