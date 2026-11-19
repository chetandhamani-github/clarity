package com.homerun.clarity.notification

object AllowedPackages {
    val APPS: Map<String, String> = mapOf(
        // UPI & Payments Apps
        "com.google.android.apps.nbu.paisa.user" to "Google Pay",
        "com.phonepe.app" to "PhonePe",
        "net.one97.paytm" to "Paytm",
        "com.dreamplug.androidapp" to "CRED",
        "in.org.npci.upiapp" to "BHIM UPI",
        "in.amazon.mShop.android.shopping" to "Amazon Pay",
        "com.naviapp" to "Navi",
        "com.mobikwik_new" to "MobiKwik",
        "com.freecharge.android" to "Freecharge",
        "money.jupiter" to "Jupiter",
        "money.fi" to "Fi Money",
        "indwin.c3.shareapp" to "Slice",

        // Major Private Banks
        "com.snapwork.hdfc" to "HDFC Bank",
        "com.csam.icici.bank.imobile" to "ICICI Bank",
        "com.axis.mobile" to "Axis Bank",
        "com.msf.kopl" to "Kotak Mahindra Bank",
        "com.idfcfirstbank.optimus" to "IDFC FIRST Bank",
        "com.indusind.mobile" to "IndusInd Bank",
        "com.yesbank" to "YES Bank",
        "com.rblbank.mobank" to "RBL Bank",
        "com.fedmobile" to "Federal Bank",
        "com.scb.breeze.in" to "Standard Chartered",
        "com.citibank.mobile.in" to "Citibank",
        "com.hsbc.in.hsbcindiapersonalbanking" to "HSBC Bank",
        "com.dbs.in.dbsmbanking" to "DBS Bank",
        "com.aubank.aupay" to "AU Small Finance Bank",

        // Major Public Sector Banks
        "com.sbi.lotusintouch" to "State Bank of India",
        "com.sbi.upi" to "SBI YONO",
        "com.bankofbaroda.mconnect" to "Bank of Baroda",
        "com.canarabank.mobility" to "Canara Bank",
        "com.pnb.one" to "Punjab National Bank",
        "com.infrasofttech.uboi" to "Union Bank of India",
        "com.boi.mpassbook" to "Bank of India",
        "com.cbi.mobile" to "Central Bank of India",
        "com.infrasoft.indianbank" to "Indian Bank",
        "com.idbi" to "IDBI Bank",
        "com.uco.ucobank" to "UCO Bank",
        "com.bom.mobile" to "Bank of Maharashtra",
        "com.fss.iobmob" to "Indian Overseas Bank",

        // Payments Banks
        "com.paytm.business" to "Paytm for Business",
        "com.airtel.bank" to "Airtel Payments Bank",
        "com.ippb.mobile" to "India Post Payments Bank"
    )

    fun isAllowed(packageName: String): Boolean {
        return APPS.containsKey(packageName)
    }

    fun getAppName(packageName: String): String? {
        return APPS[packageName]
    }
}

