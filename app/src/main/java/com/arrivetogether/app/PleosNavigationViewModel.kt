package com.arrivetogether.app

import android.app.Application
import androidx.lifecycle.AndroidViewModel

/** Retain an in-flight navigation request across activity recreation. */
class PleosNavigationViewModel(application: Application) : AndroidViewModel(application) {
    internal val navigation = PleosNavigation(application)
    override fun onCleared() { navigation.dispose() }
}
