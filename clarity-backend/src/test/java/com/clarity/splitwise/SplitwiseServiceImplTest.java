package com.clarity.splitwise;

import com.clarity.splitwise.dto.*;
import com.clarity.splitwise.entity.SplitDebt;
import com.clarity.splitwise.entity.SplitPerson;
import com.clarity.splitwise.entity.SplitSettlement;
import com.clarity.splitwise.repository.SplitDebtRepository;
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
        when(splitPersonRepository.countByInstallationIdAndIsDeletedFalse(installationId)).thenReturn(2L);
        when(splitDebtRepository.countByInstallationIdAndIsDeletedFalse(installationId)).thenReturn(2L);
        when(splitSettlementRepository.countByInstallationIdAndIsDeletedFalse(installationId)).thenReturn(1L);

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
    @DisplayName("sync: collaboratively mirrors debt when user and friend emails exist")
    void syncShouldMirrorDebtCollaboratively() {
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
        // Verify mirrored inverse debt was saved for Bob
        verify(splitDebtRepository, atLeastOnce()).save(argThat(debt ->
                "bob@gmail.com".equals(debt.getOwnerEmail()) &&
                "I_OWE".equals(debt.getType()) &&
                debt.getId().endsWith("_inv")
        ));
    }
}
