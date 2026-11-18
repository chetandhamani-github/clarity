package com.clarity.splitwise.repository;

import com.clarity.splitwise.entity.SplitGroup;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public interface SplitGroupRepository extends JpaRepository<SplitGroup, String> {

    List<SplitGroup> findByInstallationId(String installationId);

    List<SplitGroup> findByInstallationIdAndUpdatedAtAfter(String installationId, Instant since);

    Optional<SplitGroup> findByIdAndInstallationId(String id, String installationId);

    List<SplitGroup> findByOwnerEmail(String ownerEmail);

    List<SplitGroup> findByOwnerEmailAndUpdatedAtAfter(String ownerEmail, Instant since);
}

