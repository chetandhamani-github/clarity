package com.clarity.splitwise;

import com.clarity.splitwise.dto.*;
import com.clarity.splitwise.entity.SplitDebt;
import com.clarity.splitwise.entity.SplitExpense;
import com.clarity.splitwise.entity.SplitGroup;
import com.clarity.splitwise.entity.SplitGroupMember;
import com.clarity.splitwise.entity.SplitPerson;
import com.clarity.splitwise.entity.SplitSettlement;
import com.clarity.splitwise.repository.SplitDebtRepository;
import com.clarity.splitwise.repository.SplitExpenseRepository;
import com.clarity.splitwise.repository.SplitExpenseSplitRepository;
import com.clarity.splitwise.repository.SplitGroupMemberRepository;
import com.clarity.splitwise.repository.SplitGroupRepository;
import com.clarity.splitwise.repository.SplitPersonRepository;
import com.clarity.splitwise.repository.SplitSettlementRepository;
import com.clarity.splitwise.service.SplitwiseServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class SplitwiseServiceImplTest {

    @Mock
    private SplitPersonRepository splitPersonRepository;

    @Mock
    private SplitDebtRepository splitDebtRepository;

    @Mock
    private SplitSettlementRepository splitSettlementRepository;

    @Mock
    private SplitGroupRepository splitGroupRepository;

    @Mock
    private SplitGroupMemberRepository splitGroupMemberRepository;

    @Mock
    private SplitExpenseRepository splitExpenseRepository;

    @Mock
    private SplitExpenseSplitRepository splitExpenseSplitRepository;

    @Mock
    private com.clarity.auth.repository.UserRepository userRepository;

    @InjectMocks
    private SplitwiseServiceImpl splitwiseService;

    private final String installationId = "test-install-1";

    @Test
    @DisplayName("sync: creates records and placeholder person if person does not exist")
    void syncShouldCreateRecordsAndPlaceholders() {
        when(splitPersonRepository.findById(eq("p1"))).thenReturn(Optional.empty());
        when(splitPersonRepository.existsById("p1")).thenReturn(true);
        when(splitDebtRepository.findById(eq("d1"))).thenReturn(Optional.empty());

        SplitSyncRequest request = SplitSyncRequest.builder()
                .installationId(installationId)
                .people(List.of(SplitPersonDTO.builder().id("p1").name("Bob").build()))
                .debts(List.of(SplitDebtDTO.builder().id("d1").personId("p1").amount(new BigDecimal("150.00")).type("OWE_ME").description("Groceries").build()))
                .settlements(List.of())
                .build();

        SplitSyncResponse response = splitwiseService.sync(installationId, request);

        assertThat(response.isSuccess()).isTrue();
        assertThat(response.getConfirmedIds()).containsExactlyInAnyOrder("p1", "d1");
        verify(splitPersonRepository, times(1)).save(any(SplitPerson.class));
        verify(splitDebtRepository, times(1)).save(any(SplitDebt.class));
    }

    @Test
    @DisplayName("sync: soft deletes existing debt when isDeleted is true")
    void syncShouldSoftDeleteRecord() {
        SplitDebt existingDebt = SplitDebt.builder()
                .id("d1")
                .installationId(installationId)
                .personId("p1")
                .amount(new BigDecimal("50.00"))
                .type("OWE_ME")
                .description("Coffee")
                .isDeleted(false)
                .build();

        when(splitDebtRepository.findById(eq("d1"))).thenReturn(Optional.of(existingDebt));

        SplitSyncRequest request = SplitSyncRequest.builder()
                .installationId(installationId)
                .debts(List.of(SplitDebtDTO.builder().id("d1").isDeleted(true).build()))
                .build();

        SplitSyncResponse response = splitwiseService.sync(installationId, request);

        assertThat(response.isSuccess()).isTrue();
        assertThat(response.getConfirmedIds()).contains("d1");
        assertThat(existingDebt.isDeleted()).isTrue();
        verify(splitDebtRepository).save(existingDebt);
    }

    @Test
    @DisplayName("getSummary: accurately calculates remaining receivables, payables, and net balance")
    void getSummaryShouldAccuratelyCalculateBalances() {
        SplitPerson p1 = SplitPerson.builder().id("p1").installationId(installationId).name("P1").isDeleted(false).build();
        SplitPerson p2 = SplitPerson.builder().id("p2").installationId(installationId).name("P2").isDeleted(false).build();
        when(splitPersonRepository.findByInstallationId(installationId)).thenReturn(List.of(p1, p2));

        // Person 1: owes me 100, settles 40 -> remaining receivable = 60
        SplitDebt d1 = SplitDebt.builder().personId("p1").amount(new BigDecimal("100.00")).type("OWE_ME").isDeleted(false).build();
        SplitSettlement s1 = SplitSettlement.builder().personId("p1").amount(new BigDecimal("40.00")).settlementType("THEY_PAID").isDeleted(false).build();

        // Person 2: I owe 70, no settlement -> remaining payable = 70
        SplitDebt d2 = SplitDebt.builder().personId("p2").amount(new BigDecimal("70.00")).type("I_OWE").isDeleted(false).build();

        when(splitDebtRepository.findByInstallationId(installationId)).thenReturn(List.of(d1, d2));
        when(splitSettlementRepository.findByInstallationId(installationId)).thenReturn(List.of(s1));

        SplitwiseSummaryResponse summary = splitwiseService.getSummary(installationId);

        assertThat(summary.getTotalPeople()).isEqualTo(2);
        assertThat(summary.getTotalDebts()).isEqualTo(2);
        assertThat(summary.getTotalSettlements()).isEqualTo(1);
        assertThat(summary.getTotalOwedToMe()).isEqualByComparingTo(new BigDecimal("60.00"));
        assertThat(summary.getTotalIOwe()).isEqualByComparingTo(new BigDecimal("70.00"));
        assertThat(summary.getNetBalance()).isEqualByComparingTo(new BigDecimal("-10.00"));
    }

    @Test
    @DisplayName("sync: keeps 1-on-1 debts private to creator and does not mirror to friend")
    void syncShouldKeepOneOnOneDebtsPrivate() {
        com.clarity.auth.entity.User userAlice = com.clarity.auth.entity.User.builder()
                .email("alice@gmail.com")
                .name("Alice")
                .authToken("token-alice")
                .build();

        when(userRepository.findByAuthToken("token-alice")).thenReturn(Optional.of(userAlice));
        when(splitPersonRepository.findById(eq("p-bob"))).thenReturn(Optional.empty());
        when(splitPersonRepository.existsById("p-bob")).thenReturn(true);
        when(splitDebtRepository.findById(eq("d1"))).thenReturn(Optional.empty());

        SplitSyncRequest request = SplitSyncRequest.builder()
                .installationId(installationId)
                .people(List.of(SplitPersonDTO.builder().id("p-bob").name("Bob").email("bob@gmail.com").build()))
                .debts(List.of(SplitDebtDTO.builder()
                        .id("d1")
                        .personId("p-bob")
                        .friendEmail("bob@gmail.com")
                        .amount(new BigDecimal("200.00"))
                        .type("OWE_ME")
                        .description("Dinner")
                        .build()))
                .build();

        SplitSyncResponse response = splitwiseService.sync(installationId, request, "Bearer token-alice");

        assertThat(response.isSuccess()).isTrue();
        verify(splitDebtRepository, times(1)).save(argThat(debt ->
                "alice@gmail.com".equals(debt.getOwnerEmail()) &&
                "OWE_ME".equals(debt.getType()) &&
                "d1".equals(debt.getId())
        ));
        verify(splitDebtRepository, never()).save(argThat(debt ->
                "bob@gmail.com".equals(debt.getOwnerEmail()) || debt.getId().endsWith("_inv")
        ));
    }

    @Test
    @DisplayName("sync: canonicalizes current_user and shares groups and expenses with group members by email")
    void syncShouldShareGroupAndExpensesAcrossMembersByEmail() {
        com.clarity.auth.entity.User userBob = com.clarity.auth.entity.User.builder()
                .email("bob@gmail.com")
                .name("Bob")
                .authToken("token-bob")
                .build();

        when(userRepository.findByAuthToken("token-bob")).thenReturn(Optional.of(userBob));

        SplitGroup sharedGroup = SplitGroup.builder()
                .id("g-trip")
                .installationId("inst-alice")
                .name("Goa Trip")
                .currency("INR")
                .ownerEmail("alice@gmail.com")
                .isArchived(false)
                .isDeleted(false)
                .createdAt(Instant.now())
                .updatedAt(Instant.now())
                .build();

        SplitGroupMember aliceMember = SplitGroupMember.builder()
                .id("gm-1")
                .groupId("g-trip")
                .personId("user_alice@gmail.com")
                .memberEmail("alice@gmail.com")
                .memberName("Alice")
                .role("admin")
                .build();

        SplitGroupMember bobMember = SplitGroupMember.builder()
                .id("gm-2")
                .groupId("g-trip")
                .personId("p-bob")
                .memberEmail("bob@gmail.com")
                .memberName("Bob")
                .role("member")
                .build();

        SplitExpense sharedExpense = SplitExpense.builder()
                .id("exp-1")
                .installationId("inst-alice")
                .groupId("g-trip")
                .payerId("user_alice@gmail.com")
                .payerEmail("alice@gmail.com")
                .payerName("Alice")
                .description("Hotel")
                .amount(new BigDecimal("4000.00"))
                .currency("INR")
                .ownerEmail("alice@gmail.com")
                .isDeleted(false)
                .date(Instant.now())
                .createdAt(Instant.now())
                .updatedAt(Instant.now())
                .build();

        when(splitGroupMemberRepository.findByMemberEmailIgnoreCase("bob@gmail.com")).thenReturn(List.of(bobMember));
        when(splitGroupRepository.findAllById(any())).thenReturn(List.of(sharedGroup));
        when(splitGroupMemberRepository.findByGroupId("g-trip")).thenReturn(List.of(aliceMember, bobMember));
        when(splitExpenseRepository.findByGroupIdIn(any())).thenReturn(List.of(sharedExpense));
        when(splitExpenseSplitRepository.findByExpenseId("exp-1")).thenReturn(List.of());

        SplitSyncRequest bobSyncRequest = SplitSyncRequest.builder()
                .installationId("inst-bob")
                .people(List.of())
                .debts(List.of())
                .settlements(List.of())
                .build();

        SplitSyncResponse response = splitwiseService.sync("inst-bob", bobSyncRequest, "Bearer token-bob");

        assertThat(response.isSuccess()).isTrue();
        assertThat(response.getGroups()).hasSize(1);
        assertThat(response.getGroups().get(0).getId()).isEqualTo("g-trip");
        assertThat(response.getGroups().get(0).getMembers()).hasSize(2);
        assertThat(response.getExpenses()).hasSize(1);
        assertThat(response.getExpenses().get(0).getPayerEmail()).isEqualTo("alice@gmail.com");
    }

    @Test
    @DisplayName("sync: blocks spoofed X-Installation-Id from modifying or reading account-owned records")
    void syncShouldProtectAccountOwnedRecordsFromSpoofedInstallationId() {
        SplitDebt aliceOwnedDebt = SplitDebt.builder()
                .id("d-alice")
                .installationId("shared-install-id")
                .personId("p-1")
                .amount(new BigDecimal("500.00"))
                .type("OWE_ME")
                .description("Secret debt")
                .ownerEmail("alice@gmail.com")
                .isDeleted(false)
                .build();

        when(splitDebtRepository.findById("d-alice")).thenReturn(Optional.of(aliceOwnedDebt));
        when(splitDebtRepository.findByInstallationId("shared-install-id")).thenReturn(List.of(aliceOwnedDebt));

        SplitSyncRequest attackerSync = SplitSyncRequest.builder()
                .installationId("shared-install-id")
                .debts(List.of(SplitDebtDTO.builder().id("d-alice").isDeleted(true).build()))
                .build();

        SplitSyncResponse response = splitwiseService.sync("shared-install-id", attackerSync, null);

        assertThat(aliceOwnedDebt.isDeleted()).isFalse();
        assertThat(response.getDebts()).isEmpty();
    }

    @Test
    @DisplayName("sync: blocks updating an owned expense to move it into another user's group")
    void syncShouldBlockMovingOwnedExpenseIntoUnauthorizedGroup() {
        com.clarity.auth.entity.User alice = com.clarity.auth.entity.User.builder()
                .email("alice@gmail.com")
                .name("Alice")
                .authToken("token-alice")
                .build();
        when(userRepository.findByAuthToken("token-alice")).thenReturn(Optional.of(alice));

        SplitExpense aliceExpense = SplitExpense.builder()
                .id("exp-alice")
                .installationId("inst-alice")
                .ownerEmail("alice@gmail.com")
                .payerId("user_alice@gmail.com")
                .groupId(null)
                .description("Coffee")
                .amount(new BigDecimal("100.00"))
                .currency("INR")
                .isDeleted(false)
                .build();
        SplitGroup bobGroup = SplitGroup.builder()
                .id("g-bob")
                .installationId("inst-bob")
                .ownerEmail("bob@gmail.com")
                .name("Bob Private")
                .currency("INR")
                .isDeleted(false)
                .build();

        when(splitExpenseRepository.findById("exp-alice")).thenReturn(Optional.of(aliceExpense));
        when(splitGroupRepository.findById("g-bob")).thenReturn(Optional.of(bobGroup));
        when(splitGroupMemberRepository.existsByGroupIdAndMemberEmailIgnoreCase("g-bob", "alice@gmail.com"))
                .thenReturn(false);

        SplitSyncRequest req = SplitSyncRequest.builder()
                .installationId("inst-alice")
                .expenses(List.of(SplitExpenseDTO.builder()
                        .id("exp-alice")
                        .payerId("current_user")
                        .groupId("g-bob")
                        .description("Injected")
                        .amount(new BigDecimal("100.00"))
                        .build()))
                .build();

        splitwiseService.sync("inst-alice", req, "Bearer token-alice");

        assertThat(aliceExpense.getGroupId()).isNull();
        verify(splitExpenseRepository, never()).save(argThat(exp -> "g-bob".equals(exp.getGroupId())));
    }
}
