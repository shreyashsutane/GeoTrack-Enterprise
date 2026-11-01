package com.geotrack.enterprise.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.geotrack.enterprise.data.model.ReportItem
import com.geotrack.enterprise.data.model.ReportStatus
import com.geotrack.enterprise.data.preferences.AppPreferences
import com.geotrack.enterprise.data.remote.ApiClient
import com.geotrack.enterprise.ui.theme.*
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.launch

@Composable
fun ReportsHistoryScreen(
    preferences: AppPreferences
) {
    val coroutineScope = rememberCoroutineScope()
    val apiClient = remember { ApiClient() }

    var reportsList by remember {
        mutableStateOf(
            listOf(
                ReportItem(
                    id = "rep-001",
                    reportNumber = "REP-202611-0082",
                    reportDate = "2026-11-01",
                    totalDistanceKm = 58.40,
                    totalFuelAmount = 161.32,
                    extraTollAmount = 85.00,
                    extraParkingAmount = 30.00,
                    totalClaimAmount = 276.32,
                    status = ReportStatus.SUBMITTED,
                    agentNotes = "Courier drops to Andheri East & BKC",
                    submittedAt = "Today at 06:14 PM"
                ),
                ReportItem(
                    id = "rep-002",
                    reportNumber = "REP-202610-0941",
                    reportDate = "2026-10-31",
                    totalDistanceKm = 72.10,
                    totalFuelAmount = 199.22,
                    extraTollAmount = 40.00,
                    extraParkingAmount = 20.00,
                    totalClaimAmount = 259.22,
                    status = ReportStatus.APPROVED,
                    agentNotes = "North Mumbai wholesale deliveries",
                    submittedAt = "Yesterday at 05:45 PM"
                ),
                ReportItem(
                    id = "rep-003",
                    reportNumber = "REP-202610-0812",
                    reportDate = "2026-10-30",
                    totalDistanceKm = 41.50,
                    totalFuelAmount = 114.67,
                    extraTollAmount = 0.00,
                    extraParkingAmount = 15.00,
                    totalClaimAmount = 129.67,
                    status = ReportStatus.PAID,
                    agentNotes = "Thane client documentation collection",
                    submittedAt = "Oct 30, 2026"
                )
            )
        )
    }

    var isLoading by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        coroutineScope.launch {
            val apiUrl = preferences.apiUrlFlow.firstOrNull() ?: AppPreferences.DEFAULT_API_URL
            val token = preferences.authTokenFlow.firstOrNull() ?: ""
            if (token.isNotBlank()) {
                val res = apiClient.fetchMyReports(apiUrl, token)
                res.onSuccess { remoteReports ->
                    if (remoteReports.isNotEmpty()) {
                        reportsList = remoteReports
                    }
                }
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(DarkBackground)
            .padding(16.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = "My Expense Claims",
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Bold,
                    color = TextPrimary
                )
                Text(
                    text = "Review submitted trip & fuel reports",
                    fontSize = 13.sp,
                    color = TextSecondary
                )
            }

            IconButton(onClick = {
                coroutineScope.launch {
                    isLoading = true
                    val apiUrl = preferences.apiUrlFlow.firstOrNull() ?: AppPreferences.DEFAULT_API_URL
                    val token = preferences.authTokenFlow.firstOrNull() ?: ""
                    if (token.isNotBlank()) {
                        val res = apiClient.fetchMyReports(apiUrl, token)
                        res.onSuccess { if (it.isNotEmpty()) reportsList = it }
                    }
                    isLoading = false
                }
            }) {
                Icon(Icons.Default.Refresh, contentDescription = null, tint = CyanPrimary)
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        if (isLoading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = CyanPrimary)
            }
        } else {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.fillMaxSize()
            ) {
                items(reportsList) { report ->
                    ReportCardItem(report = report)
                }
            }
        }
    }
}

@Composable
fun ReportCardItem(report: ReportItem) {
    val (statusColor, statusBg, statusText) = when (report.status) {
        ReportStatus.SUBMITTED -> Triple(AccentOrange, AccentOrange.copy(alpha = 0.15f), "IN REVIEW")
        ReportStatus.APPROVED -> Triple(AccentGreen, AccentGreen.copy(alpha = 0.15f), "APPROVED")
        ReportStatus.REJECTED -> Triple(AccentRed, AccentRed.copy(alpha = 0.15f), "REJECTED")
        ReportStatus.PAID -> Triple(CyanPrimary, CyanPrimary.copy(alpha = 0.15f), "PAID")
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = DarkSurface),
        shape = RoundedCornerShape(14.dp),
        border = CardDefaults.outlinedCardBorder().copy(brush = Brush.linearGradient(listOf(DarkBorder, DarkBorder)))
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = report.reportNumber,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        color = TextPrimary
                    )
                    Text(
                        text = "Trip Date: ${report.reportDate}",
                        fontSize = 12.sp,
                        color = TextSecondary
                    )
                }

                Surface(
                    shape = RoundedCornerShape(20.dp),
                    color = statusBg
                ) {
                    Text(
                        text = statusText,
                        color = statusColor,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Column {
                    Text("Distance", fontSize = 11.sp, color = TextMuted)
                    Text("${report.totalDistanceKm} km", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = TextPrimary)
                }
                Column {
                    Text("Fuel Claim", fontSize = 11.sp, color = TextMuted)
                    Text("₹ ${"%.2f".format(report.totalFuelAmount)}", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = TextPrimary)
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text("Total Claim", fontSize = 11.sp, color = TextMuted)
                    Text("₹ ${"%.2f".format(report.totalClaimAmount)}", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = AccentGreen)
                }
            }

            if (!report.agentNotes.isNullOrBlank()) {
                Spacer(modifier = Modifier.height(10.dp))
                Text(
                    text = "“${report.agentNotes}”",
                    fontSize = 12.sp,
                    color = TextSecondary,
                    maxLines = 2
                )
            }

            if (!report.rejectionReason.isNullOrBlank()) {
                Spacer(modifier = Modifier.height(8.dp))
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = AccentRed.copy(alpha = 0.12f),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = "Manager Note: ${report.rejectionReason}",
                        color = AccentRed,
                        fontSize = 12.sp,
                        modifier = Modifier.padding(8.dp)
                    )
                }
            }
        }
    }
}
