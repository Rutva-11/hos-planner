from django.urls import path
from .views import plan_trip, autocomplete_location, copilot_chat

urlpatterns = [
    path("plan/", plan_trip, name="trip-plan"),
    path("autocomplete/", autocomplete_location, name="autocomplete"),
    path("copilot/", copilot_chat, name="copilot"),
]