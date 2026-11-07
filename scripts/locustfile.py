import random
from locust import HttpUser, task, between

class TourismUser(HttpUser):
    wait_time = between(0.1, 0.5)

    @task(3)
    def get_places(self):
        self.client.get("/places?limit=20&offset=0", name="/places")

    @task(3)
    def get_calendar(self):
        place_id = random.randint(1, 6)
        self.client.get(
            f"/calendar?place_id={place_id}&from=2026-11-02&to=2026-11-17",
            name="/calendar"
        )
