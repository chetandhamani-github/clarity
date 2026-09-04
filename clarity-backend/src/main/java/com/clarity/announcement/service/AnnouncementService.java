package com.clarity.announcement.service;

import com.clarity.announcement.dto.AnnouncementResponse;

import java.util.List;

public interface AnnouncementService {

    List<AnnouncementResponse> getActiveAnnouncements();
}
