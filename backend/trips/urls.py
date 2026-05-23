from django.urls import path
from .views import plan_trip, autocomplete_location, copilot_chat, get_daily_logs

urlpatterns = [
    path("plan/", plan_trip, name="trip-plan"),
    path("autocomplete/", autocomplete_location, name="autocomplete"),
    path("copilot/", copilot_chat, name="copilot"),
    path("logs/", get_daily_logs, name="daily-logs"),
]