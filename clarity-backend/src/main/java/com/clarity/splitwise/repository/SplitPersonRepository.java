package com.clarity.splitwise.repository;

import com.clarity.splitwise.entity.SplitPerson;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public interface SplitPersonRepository extends JpaRepository<SplitPerson, String> {

    List<SplitPerson> findByInstallationId(String installationId);

    List<SplitPerson> findByInstallationIdAndUpdatedAtAfter(String installationId, Instant since);

    Optional<SplitPerson> findByIdAndInstallationId(String id, String installationId);

    long countByInstallationIdAndIsDeletedFalse(String installationId);

    List<SplitPerson> findByOwnerEmail(String ownerEmail);

    List<SplitPerson> findByOwnerEmailAndUpdatedAtAfter(String ownerEmail, Instant since);

    Optional<SplitPerson> findByOwnerEmailAndEmail(String ownerEmail, String email);
}
