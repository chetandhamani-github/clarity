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
        String parsedUserEmail = null;
        String parsedUserName = null;
        if (authHeader != null && !authHeader.trim().isEmpty()) {
            String token = authHeader.trim().startsWith("Bearer ")
                    ? authHeader.trim().substring(7).trim()
                    : authHeader.trim();
            Optional<User> userOpt = userRepository.findByAuthToken(token);
            if (userOpt.isPresent()) {
                parsedUserEmail = userOpt.get().getEmail().toLowerCase().trim();
                parsedUserName = userOpt.get().getName();
            }
        }
        final String currentUserEmail = parsedUserEmail;
        final String currentUserName = parsedUserName;

        Instant syncTimestamp = Instant.now();
        Set<String> confirmedIds = new HashSet<>();
        Set<String> incomingPersonIds = new HashSet<>();
        Set<String> incomingDebtIds = new HashSet<>();
        Set<String> incomingSettlementIds = new HashSet<>();
        Set<String> incomingGroupIds = new HashSet<>();
        Set<String> incomingExpenseIds = new HashSet<>();
        Map<String, String> personEmailMap = new HashMap<>();
        Map<String, String> personNameMap = new HashMap<>();

        // 1. Process incoming people
        if (request.getPeople() != null) {
            for (SplitPersonDTO p : request.getPeople()) {
                if (p.getId() == null) continue;
                incomingPersonIds.add(p.getId());
                confirmedIds.add(p.getId());

                Instant recordUpdatedAt = parseInstant(p.getUpdatedAt(), syncTimestamp);
                Instant recordCreatedAt = parseInstant(p.getCreatedAt(), syncTimestamp);

                String personEmail = normalizeEmail(p.getEmail());
                if (personEmail != null) {
                    personEmailMap.put(p.getId(), personEmail);
                }
                if (p.getName() != null && !p.getName().isBlank()) {
                    personNameMap.put(p.getId(), p.getName().trim());
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
                    continue;
                }

                if (d.getPersonId() == null || d.getAmount() == null) continue;

                // Ensure person exists in database to satisfy foreign key constraint
                if (!splitPersonRepository.existsById(d.getPersonId())) {
                    SplitPerson placeholder = SplitPerson.builder()
                            .id(d.getPersonId())
                            .installationId(installationId)
                            .name(personNameMap.getOrDefault(d.getPersonId(), "Friend"))
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
            }
        }

        // 3. Process incoming settlements (1-on-1 settlements stay private; group settlements sync with member)
        if (request.getSettlements() != null) {
            for (SplitSettlementDTO s : request.getSettlements()) {
                if (s.getId() == null) continue;
                incomingSettlementIds.add(s.getId());
                confirmedIds.add(s.getId());

                Instant recordUpdatedAt = parseInstant(s.getUpdatedAt(), syncTimestamp);
                Instant recordCreatedAt = parseInstant(s.getCreatedAt(), syncTimestamp);

                String friendEmail = normalizeEmail(s.getFriendEmail());
                if (friendEmail == null) {
                    friendEmail = personEmailMap.get(s.getPersonId());
                }
                if (friendEmail == null && s.getPersonId() != null) {
                    friendEmail = normalizeEmail(splitPersonRepository.findById(s.getPersonId()).map(SplitPerson::getEmail).orElse(null));
                }
                String normalizedGroupId = (s.getGroupId() != null && !s.getGroupId().trim().isEmpty())
                        ? s.getGroupId().trim()
                        : null;

                Optional<SplitSettlement> existingOpt = findAuthorizedSettlement(s.getId(), installationId, currentUserEmail);
                if (s.isDeleted()) {
                    String existingGroupId = existingOpt.map(SplitSettlement::getGroupId).orElse(normalizedGroupId);
                    if (existingOpt.isPresent()) {
                        SplitSettlement settlement = existingOpt.get();
                        settlement.setDeleted(true);
                        settlement.setUpdatedAt(recordUpdatedAt);
                        splitSettlementRepository.save(settlement);
                    }
                    if (existingGroupId != null && currentUserEmail != null && friendEmail != null) {
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
                            .name(personNameMap.getOrDefault(s.getPersonId(), "Friend"))
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
                settlement.setGroupId(normalizedGroupId);
                settlement.setOwnerEmail(currentUserEmail);
                settlement.setDeleted(false);
                settlement.setUpdatedAt(recordUpdatedAt);

                splitSettlementRepository.save(settlement);

                // Mirror settlement to friend only when settling a collaborative group balance
                if (normalizedGroupId != null && currentUserEmail != null && friendEmail != null && !friendEmail.equalsIgnoreCase(currentUserEmail)) {
                    mirrorSettlementForFriend(currentUserEmail, currentUserName, friendEmail, s, normalizedGroupId, recordCreatedAt, recordUpdatedAt);
                }
            }
        }

        // 4. Process incoming groups (collaborative across members by Google email)
        if (request.getGroups() != null) {
            for (SplitGroupDTO g : request.getGroups()) {
                if (g.getId() == null) continue;
                incomingGroupIds.add(g.getId());
                confirmedIds.add(g.getId());

                Instant recordUpdatedAt = parseInstant(g.getUpdatedAt(), syncTimestamp);
                Instant recordCreatedAt = parseInstant(g.getCreatedAt(), syncTimestamp);

                Optional<SplitGroup> existingOpt = splitGroupRepository.findById(g.getId());
                if (existingOpt.isPresent() && !isAuthorizedForGroup(existingOpt.get(), installationId, currentUserEmail)) {
                    continue;
                }

                if (g.isDeleted()) {
                    if (existingOpt.isPresent()) {
                        SplitGroup group = existingOpt.get();
                        group.setDeleted(true);
                        group.setUpdatedAt(recordUpdatedAt);
                        splitGroupRepository.save(group);
                    }
                    continue;
                }

                boolean isNewGroup = existingOpt.isEmpty();
                SplitGroup group = existingOpt.orElseGet(() -> SplitGroup.builder()
                        .id(g.getId())
                        .installationId(installationId)
                        .ownerEmail(currentUserEmail)
                        .createdAt(recordCreatedAt)
                        .build());

                group.setName(g.getName() != null ? g.getName() : "Group");
                group.setDescription(g.getDescription());
                group.setIcon(g.getIcon());
                group.setCategory(g.getCategory());
                group.setCurrency(g.getCurrency() != null ? g.getCurrency() : "INR");
                if (isNewGroup || group.getOwnerEmail() == null) {
                    group.setOwnerEmail(currentUserEmail);
                }
                group.setArchived(g.isArchived());
                group.setDeleted(false);
                group.setUpdatedAt(recordUpdatedAt);

                splitGroupRepository.save(group);

                // Resolve members cleanly by canonical server person ID + member email
                List<SplitGroupMemberDTO> incomingMembers = new ArrayList<>();
                if (g.getMembers() != null && !g.getMembers().isEmpty()) {
                    incomingMembers.addAll(g.getMembers());
                } else if (g.getMemberIds() != null) {
                    for (String memberPersonId : g.getMemberIds()) {
                        incomingMembers.add(SplitGroupMemberDTO.builder()
                                .personId(memberPersonId)
                                .role("current_user".equals(memberPersonId) ? "admin" : "member")
                                .build());
                    }
                }

                if (!incomingMembers.isEmpty()) {
                    splitGroupMemberRepository.deleteByGroupId(g.getId());
                    Set<String> seenPersonIds = new HashSet<>();
                    for (SplitGroupMemberDTO m : incomingMembers) {
                        if (m.getPersonId() == null) continue;
                        ResolvedPerson resolved = resolveCanonicalPerson(
                                m.getPersonId(),
                                m.getEmail(),
                                m.getName(),
                                installationId,
                                currentUserEmail,
                                currentUserName,
                                personEmailMap,
                                personNameMap,
                                recordCreatedAt,
                                recordUpdatedAt
                        );
                        if (!seenPersonIds.add(resolved.personId())) {
                            continue;
                        }
                        SplitGroupMember member = SplitGroupMember.builder()
                                .id(UUID.randomUUID().toString())
                                .groupId(g.getId())
                                .personId(resolved.personId())
                                .memberEmail(resolved.email())
                                .memberName(resolved.name())
                                .role(m.getRole() != null ? m.getRole() : "member")
                                .joinedAt(recordCreatedAt)
                                .build();
                        splitGroupMemberRepository.save(member);
                    }
                }
            }
        }

        // 5. Process incoming expenses (collaborative across group members)
        if (request.getExpenses() != null) {
            for (SplitExpenseDTO e : request.getExpenses()) {
                if (e.getId() == null) continue;
                incomingExpenseIds.add(e.getId());
                confirmedIds.add(e.getId());

                Instant recordUpdatedAt = parseInstant(e.getUpdatedAt(), syncTimestamp);
                Instant recordCreatedAt = parseInstant(e.getCreatedAt(), syncTimestamp);

                Optional<SplitExpense> existingOpt = splitExpenseRepository.findById(e.getId());
                String targetGroupId = existingOpt.map(SplitExpense::getGroupId).orElse(e.getGroupId());
                if (!isAuthorizedForExpense(existingOpt.orElse(null), targetGroupId, installationId, currentUserEmail)) {
                    continue;
                }

                if (e.isDeleted()) {
                    if (existingOpt.isPresent()) {
                        SplitExpense exp = existingOpt.get();
                        exp.setDeleted(true);
                        exp.setUpdatedAt(recordUpdatedAt);
                        splitExpenseRepository.save(exp);
                    }
                    continue;
                }

                if (e.getPayerId() == null) continue;
                ResolvedPerson resolvedPayer = resolveCanonicalPerson(
                        e.getPayerId(),
                        e.getPayerEmail(),
                        e.getPayerName(),
                        installationId,
                        currentUserEmail,
                        currentUserName,
                        personEmailMap,
                        personNameMap,
                        recordCreatedAt,
                        recordUpdatedAt
                );

                boolean isNewExpense = existingOpt.isEmpty();
                SplitExpense exp = existingOpt.orElseGet(() -> SplitExpense.builder()
                        .id(e.getId())
                        .installationId(installationId)
                        .ownerEmail(currentUserEmail)
                        .createdAt(recordCreatedAt)
                        .build());

                exp.setDescription(e.getDescription() != null ? e.getDescription() : "Expense");
                exp.setAmount(e.getAmount() != null ? e.getAmount() : BigDecimal.ZERO);
                exp.setCurrency(e.getCurrency() != null ? e.getCurrency() : "INR");
                exp.setCategory(e.getCategory());
                exp.setDate(parseInstant(e.getDate(), recordCreatedAt));
                exp.setPayerId(resolvedPayer.personId());
                exp.setPayerEmail(resolvedPayer.email());
                exp.setPayerName(resolvedPayer.name());
                exp.setGroupId(e.getGroupId());
                exp.setSplitType(e.getSplitType() != null ? e.getSplitType() : "EQUAL");
                exp.setNotes(e.getNotes());
                exp.setReceiptUrl(e.getReceiptUrl());
                if (isNewExpense || exp.getOwnerEmail() == null) {
                    exp.setOwnerEmail(currentUserEmail);
                }
                exp.setDeleted(false);
                exp.setUpdatedAt(recordUpdatedAt);

                splitExpenseRepository.save(exp);

                // Splits
                if (e.getSplits() != null) {
                    splitExpenseSplitRepository.deleteByExpenseId(e.getId());
                    for (SplitExpenseSplitDTO s : e.getSplits()) {
                        if (s.getPersonId() == null) continue;
                        ResolvedPerson resolvedSplitPerson = resolveCanonicalPerson(
                                s.getPersonId(),
                                s.getPersonEmail(),
                                s.getPersonName(),
                                installationId,
                                currentUserEmail,
                                currentUserName,
                                personEmailMap,
                                personNameMap,
                                recordCreatedAt,
                                recordUpdatedAt
                        );
                        SplitExpenseSplit split = SplitExpenseSplit.builder()
                                .id(s.getId() != null ? s.getId() : UUID.randomUUID().toString())
                                .expenseId(e.getId())
                                .personId(resolvedSplitPerson.personId())
                                .personEmail(resolvedSplitPerson.email())
                                .personName(resolvedSplitPerson.name())
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

            // Collaborative groups & group expenses where user is a member by Google email
            List<SplitGroupMember> memberships = splitGroupMemberRepository.findByMemberEmailIgnoreCase(currentUserEmail);
            Set<String> sharedGroupIds = new HashSet<>();
            gEmail.forEach(g -> sharedGroupIds.add(g.getId()));
            memberships.forEach(m -> sharedGroupIds.add(m.getGroupId()));

            Set<String> updatedSharedGroupIds = new HashSet<>();
            if (!memberships.isEmpty()) {
                Set<String> memberGroupIds = memberships.stream()
                        .map(SplitGroupMember::getGroupId)
                        .collect(java.util.stream.Collectors.toSet());
                List<SplitGroup> memberGroups = splitGroupRepository.findAllById(memberGroupIds);
                for (SplitGroup g : memberGroups) {
                    if (since == null || (g.getUpdatedAt() != null && g.getUpdatedAt().isAfter(since))) {
                        serverGroupsMap.put(g.getId(), g);
                        updatedSharedGroupIds.add(g.getId());
                    }
                }
            }

            if (!sharedGroupIds.isEmpty()) {
                List<SplitExpense> groupExpenses = splitExpenseRepository.findByGroupIdIn(sharedGroupIds);
                for (SplitExpense e : groupExpenses) {
                    boolean isNewOrUpdatedSince = since == null
                            || (e.getUpdatedAt() != null && e.getUpdatedAt().isAfter(since))
                            || updatedSharedGroupIds.contains(e.getGroupId());
                    if (isNewOrUpdatedSince) {
                        serverExpensesMap.put(e.getId(), e);
                    }
                }
            }
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

    private boolean isAuthorizedForGroup(SplitGroup group, String installationId, String currentUserEmail) {
        if (installationId.equals(group.getInstallationId())) {
            return true;
        }
        if (currentUserEmail == null) {
            return false;
        }
        if (currentUserEmail.equalsIgnoreCase(group.getOwnerEmail())) {
            return true;
        }
        return splitGroupMemberRepository.existsByGroupIdAndMemberEmailIgnoreCase(group.getId(), currentUserEmail);
    }

    private boolean isAuthorizedForExpense(SplitExpense existing, String groupId, String installationId, String currentUserEmail) {
        if (groupId != null && !groupId.isBlank()) {
            Optional<SplitGroup> groupOpt = splitGroupRepository.findById(groupId);
            if (groupOpt.isPresent()) {
                return isAuthorizedForGroup(groupOpt.get(), installationId, currentUserEmail);
            }
        }
        if (existing == null) {
            return true;
        }
        return installationId.equals(existing.getInstallationId())
                || (currentUserEmail != null && currentUserEmail.equalsIgnoreCase(existing.getOwnerEmail()));
    }

    private String normalizeEmail(String email) {
        if (email == null) return null;
        String trimmed = email.trim().toLowerCase();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private record ResolvedPerson(String personId, String email, String name) {}

    private ResolvedPerson resolveCanonicalPerson(
            String rawPersonId,
            String explicitEmail,
            String explicitName,
            String installationId,
            String currentUserEmail,
            String currentUserName,
            Map<String, String> personEmailMap,
            Map<String, String> personNameMap,
            Instant createdAt,
            Instant updatedAt
    ) {
        boolean isCurrentUser = "current_user".equals(rawPersonId);
        String canonicalId = isCurrentUser
                ? (currentUserEmail != null ? "user_" + currentUserEmail : "user_inst_" + installationId)
                : rawPersonId;

        String resolvedEmail = normalizeEmail(explicitEmail);
        if (resolvedEmail == null) {
            resolvedEmail = isCurrentUser ? currentUserEmail : personEmailMap.get(canonicalId);
        }
        if (resolvedEmail == null && !isCurrentUser) {
            resolvedEmail = normalizeEmail(splitPersonRepository.findById(canonicalId).map(SplitPerson::getEmail).orElse(null));
        }

        String resolvedName = (explicitName != null && !explicitName.isBlank()) ? explicitName.trim() : null;
        if (resolvedName == null) {
            if (isCurrentUser) {
                resolvedName = (currentUserName != null && !currentUserName.isBlank())
                        ? currentUserName
                        : (currentUserEmail != null ? currentUserEmail.split("@")[0] : "Member");
            } else {
                resolvedName = personNameMap.get(canonicalId);
                if (resolvedName == null) {
                    resolvedName = splitPersonRepository.findById(canonicalId).map(SplitPerson::getName).orElse(null);
                }
            }
        }
        if (resolvedName == null || resolvedName.isBlank()) {
            resolvedName = resolvedEmail != null ? resolvedEmail.split("@")[0] : "Member";
        }

        if (!splitPersonRepository.existsById(canonicalId)) {
            SplitPerson placeholder = SplitPerson.builder()
                    .id(canonicalId)
                    .installationId(installationId)
                    .name(resolvedName)
                    .email(resolvedEmail)
                    .ownerEmail(isCurrentUser ? resolvedEmail : currentUserEmail)
                    .createdAt(createdAt)
                    .updatedAt(updatedAt)
                    .build();
            splitPersonRepository.save(placeholder);
        }

        return new ResolvedPerson(canonicalId, resolvedEmail, resolvedName);
    }

    private String getInverseId(String id) {
        if (id == null) return null;
        return id.endsWith("_inv") ? id.substring(0, id.length() - 4) : id + "_inv";
    }

    private void mirrorSettlementForFriend(String userEmail, String userName, String friendEmail,
                                           SplitSettlementDTO originalSettlement, String groupId,
                                           Instant createdAt, Instant updatedAt) {
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
            inverseSettlement.setGroupId(groupId);
            inverseSettlement.setOwnerEmail(friendEmail);
            inverseSettlement.setDeleted(originalSettlement.isDeleted());
            inverseSettlement.setUpdatedAt(updatedAt);

            splitSettlementRepository.save(inverseSettlement);
            log.info("Mirrored group settlement {} for friend {} in group {}", inverseSettlementId, friendEmail, groupId);
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
                .groupId(s.getGroupId())
                .amount(s.getAmount())
                .settlementType(s.getSettlementType())
                .description(s.getDescription())
                .isDeleted(s.isDeleted())
                .createdAt(s.getCreatedAt() != null ? s.getCreatedAt().toString() : null)
                .updatedAt(s.getUpdatedAt() != null ? s.getUpdatedAt().toString() : null)
                .build();
    }

    private SplitGroupDTO mapGroup(SplitGroup g) {
        List<SplitGroupMember> memberEntities = splitGroupMemberRepository.findByGroupId(g.getId());
        List<String> memberIds = memberEntities.stream()
                .map(SplitGroupMember::getPersonId)
                .toList();
        List<SplitGroupMemberDTO> members = memberEntities.stream()
                .map(m -> {
                    String email = normalizeEmail(m.getMemberEmail());
                    String name = m.getMemberName();
                    if (email == null || name == null || name.isBlank()) {
                        Optional<SplitPerson> personOpt = splitPersonRepository.findById(m.getPersonId());
                        if (email == null) {
                            email = personOpt.map(SplitPerson::getEmail).map(this::normalizeEmail).orElse(null);
                        }
                        if (name == null || name.isBlank()) {
                            name = personOpt.map(SplitPerson::getName).orElse(null);
                        }
                    }
                    return SplitGroupMemberDTO.builder()
                            .personId(m.getPersonId())
                            .email(email)
                            .name(name)
                            .role(m.getRole())
                            .build();
                })
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
                .members(members)
                .isArchived(g.isArchived())
                .isDeleted(g.isDeleted())
                .createdAt(g.getCreatedAt() != null ? g.getCreatedAt().toString() : null)
                .updatedAt(g.getUpdatedAt() != null ? g.getUpdatedAt().toString() : null)
                .build();
    }

    private SplitExpenseDTO mapExpense(SplitExpense e) {
        String payerEmail = normalizeEmail(e.getPayerEmail());
        String payerName = e.getPayerName();
        if (payerEmail == null || payerName == null || payerName.isBlank()) {
            Optional<SplitPerson> payerOpt = splitPersonRepository.findById(e.getPayerId());
            if (payerEmail == null) {
                payerEmail = payerOpt.map(SplitPerson::getEmail).map(this::normalizeEmail).orElse(null);
            }
            if (payerName == null || payerName.isBlank()) {
                payerName = payerOpt.map(SplitPerson::getName).orElse(null);
            }
        }

        List<SplitExpenseSplitDTO> splits = splitExpenseSplitRepository.findByExpenseId(e.getId()).stream()
                .map(s -> {
                    String personEmail = normalizeEmail(s.getPersonEmail());
                    String personName = s.getPersonName();
                    if (personEmail == null || personName == null || personName.isBlank()) {
                        Optional<SplitPerson> spOpt = splitPersonRepository.findById(s.getPersonId());
                        if (personEmail == null) {
                            personEmail = spOpt.map(SplitPerson::getEmail).map(this::normalizeEmail).orElse(null);
                        }
                        if (personName == null || personName.isBlank()) {
                            personName = spOpt.map(SplitPerson::getName).orElse(null);
                        }
                    }
                    return SplitExpenseSplitDTO.builder()
                            .id(s.getId())
                            .expenseId(s.getExpenseId())
                            .personId(s.getPersonId())
                            .personEmail(personEmail)
                            .personName(personName)
                            .paidAmount(s.getPaidAmount())
                            .owedAmount(s.getOwedAmount())
                            .percentage(s.getPercentage())
                            .shares(s.getShares())
                            .isPaid(s.isPaid())
                            .createdAt(s.getCreatedAt() != null ? s.getCreatedAt().toString() : null)
                            .build();
                })
                .toList();

        return SplitExpenseDTO.builder()
                .id(e.getId())
                .groupId(e.getGroupId())
                .payerId(e.getPayerId())
                .payerEmail(payerEmail)
                .payerName(payerName)
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
