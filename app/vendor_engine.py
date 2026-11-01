"""Vendor checklist engine providing actionable, priority-ranked supplier workflows.

Covers Weddings, Birthdays, and Community events with real operational checklists.
"""
from __future__ import annotations

from .models import VendorGroup, VendorTask


def build_vendor_groups(event_type: str) -> list[VendorGroup]:
    """Generate comprehensive, categorized vendor checklists tailored to the event type."""
    if event_type == "wedding":
        return [
            VendorGroup(
                vendor="Venue & Hospitality",
                tasks=[
                    VendorTask(
                        id="v-w-1",
                        vendor_category="Venue & Hospitality",
                        title="Confirm banquet capacity, curfew, and noise restrictions",
                        description="Ensure hall comfortably accommodates peak guest count and verify outdoor sound cut-off time (e.g., 10:00 PM).",
                        priority="high",
                    ),
                    VendorTask(
                        id="v-w-2",
                        vendor_category="Venue & Hospitality",
                        title="Verify dedicated generator power backup and green rooms",
                        description="Inspect bridal changing suites, air-conditioning capacity, and switchover time during grid outages.",
                        priority="high",
                    ),
                    VendorTask(
                        id="v-w-3",
                        vendor_category="Venue & Hospitality",
                        title="Review parking capacity, valet agreements, and overtime fee schedule",
                        description="Lock in written hourly extension rates for ceremony overruns and ensure dedicated valet lanes.",
                        priority="medium",
                    ),
                ],
            ),
            VendorGroup(
                vendor="Catering & Dining",
                tasks=[
                    VendorTask(
                        id="v-w-4",
                        vendor_category="Catering & Dining",
                        title="Schedule comprehensive menu tasting and approve live counters",
                        description="Sample appetizers, signature desserts, and main courses with key family decision makers.",
                        priority="high",
                    ),
                    VendorTask(
                        id="v-w-5",
                        vendor_category="Catering & Dining",
                        title="Document dietary requirements (Jain, Vegan, Gluten-Free, Nut Allergies)",
                        description="Establish dedicated preparation zones and clearly labelled buffet displays for specific diets.",
                        priority="high",
                    ),
                    VendorTask(
                        id="v-w-6",
                        vendor_category="Catering & Dining",
                        title="Confirm server headcount ratio and continuous mineral water service",
                        description="Target minimum 1 server per 25-30 guests and confirm continuous replenishment of drinking water stations.",
                        priority="medium",
                    ),
                ],
            ),
            VendorGroup(
                vendor="Photography & Cinematography",
                tasks=[
                    VendorTask(
                        id="v-w-7",
                        vendor_category="Photography & Cinematography",
                        title="Review full recent wedding galleries, not merely curated highlights",
                        description="Evaluate low-light performance during evening receptions and indoor mandap ceremonies.",
                        priority="high",
                    ),
                    VendorTask(
                        id="v-w-8",
                        vendor_category="Photography & Cinematography",
                        title="Draft explicit family shot list and VIP portrait schedule",
                        description="Identify immediate family members, close mentors, and ceremonial moments that must not be missed.",
                        priority="high",
                    ),
                    VendorTask(
                        id="v-w-9",
                        vendor_category="Photography & Cinematography",
                        title="Confirm deliverables, raw footage rights, and album turnaround time",
                        description="Document deadline for teaser video (within 14 days) and finalized heirloom photo album.",
                        priority="medium",
                    ),
                ],
            ),
            VendorGroup(
                vendor="Attire, Styling & Beauty",
                tasks=[
                    VendorTask(
                        id="v-w-10",
                        vendor_category="Attire, Styling & Beauty",
                        title="Book hair, makeup, and mehendi trials at least 6 weeks in advance",
                        description="Test foundation hold against local humidity and finalize hair accessories/floral jewelry.",
                        priority="high",
                    ),
                    VendorTask(
                        id="v-w-11",
                        vendor_category="Attire, Styling & Beauty",
                        title="Schedule final bridal/groom garment alterations 2 weeks prior",
                        description="Walk and sit in ceremonial outfits with footwear to ensure comfortable mobility.",
                        priority="high",
                    ),
                ],
            ),
            VendorGroup(
                vendor="Decor, Florals & Ambience",
                tasks=[
                    VendorTask(
                        id="v-w-12",
                        vendor_category="Decor, Florals & Ambience",
                        title="Approve itemized decor mood board and stage dimensions",
                        description="Ensure mandap or stage height provides clear sightlines for seated guests in the rear rows.",
                        priority="high",
                    ),
                    VendorTask(
                        id="v-w-13",
                        vendor_category="Decor, Florals & Ambience",
                        title="Establish setup completion deadline 3 hours before guest arrival",
                        description="Allow sufficient buffer for photography portraits before the venue fills with arriving guests.",
                        priority="medium",
                    ),
                ],
            ),
            VendorGroup(
                vendor="Guest Logistics & Transport",
                tasks=[
                    VendorTask(
                        id="v-w-14",
                        vendor_category="Guest Logistics & Transport",
                        title="Coordinate hotel room block check-ins and welcome baskets",
                        description="Assign a family volunteer contact for airport/station pick-ups and luggage handling.",
                        priority="medium",
                    ),
                    VendorTask(
                        id="v-w-15",
                        vendor_category="Guest Logistics & Transport",
                        title="Confirm bridal departure transportation and late-night guest shuttles",
                        description="Arrange vetted drivers with confirmed route maps between accommodation and banquet venues.",
                        priority="medium",
                    ),
                ],
            ),
        ]
    elif event_type == "birthday":
        return [
            VendorGroup(
                vendor="Venue & Party Space",
                tasks=[
                    VendorTask(
                        id="v-b-1",
                        vendor_category="Venue & Party Space",
                        title="Confirm party hall booking hours and setup/cleanup access windows",
                        description="Secure at least 1 hour before and 45 minutes after the party for decoration and breakdown.",
                        priority="high",
                    ),
                    VendorTask(
                        id="v-b-2",
                        vendor_category="Venue & Party Space",
                        title="Check external vendor policy for outside catering and custom cakes",
                        description="Confirm whether the venue charges cake-cutting fees or requires approved supplier lists.",
                        priority="high",
                    ),
                ],
            ),
            VendorGroup(
                vendor="Custom Cake & Refreshments",
                tasks=[
                    VendorTask(
                        id="v-b-3",
                        vendor_category="Custom Cake & Refreshments",
                        title="Order custom themed cake with dietary and allergen specifications",
                        description="Specify eggless/nut-free options and agree on temperature-controlled delivery timing.",
                        priority="high",
                    ),
                    VendorTask(
                        id="v-b-4",
                        vendor_category="Custom Cake & Refreshments",
                        title="Plan child-friendly snack menu, finger foods, and juice dispensers",
                        description="Select mess-free finger foods, bite-sized sandwiches, cupcakes, and fruit skewers.",
                        priority="medium",
                    ),
                ],
            ),
            VendorGroup(
                vendor="Entertainment & Activities",
                tasks=[
                    VendorTask(
                        id="v-b-5",
                        vendor_category="Entertainment & Activities",
                        title="Engage age-appropriate entertainer (game host, magician, or face painter)",
                        description="Verify references, background checks, and confirm length of interactive engagement.",
                        priority="high",
                    ),
                    VendorTask(
                        id="v-b-6",
                        vendor_category="Entertainment & Activities",
                        title="Curate birthday games playlist, microphone, and prize tokens",
                        description="Prepare upbeat background music and fun participation prizes so every child feels celebrated.",
                        priority="medium",
                    ),
                ],
            ),
            VendorGroup(
                vendor="Decor, Balloons & Favors",
                tasks=[
                    VendorTask(
                        id="v-b-7",
                        vendor_category="Decor, Balloons & Favors",
                        title="Finalise balloon arch, custom backdrop banner, and photo props",
                        description="Choose color palette aligned with child's favorite themes and ensure secure mounting.",
                        priority="medium",
                    ),
                    VendorTask(
                        id="v-b-8",
                        vendor_category="Decor, Balloons & Favors",
                        title="Assemble customized return gift favor bags by age group",
                        description="Pack age-appropriate storybooks, creative art kits, and personalized thank-you tags.",
                        priority="medium",
                    ),
                ],
            ),
            VendorGroup(
                vendor="Photography & Memories",
                tasks=[
                    VendorTask(
                        id="v-b-9",
                        vendor_category="Photography & Memories",
                        title="Hire dedicated photographer for cake cutting and candid games",
                        description="Allow parents to enjoy the celebration while a professional captures high-resolution candid moments.",
                        priority="medium",
                    ),
                ],
            ),
        ]
    else:  # community
        return [
            VendorGroup(
                vendor="Venue, Civic Permissions & Licensing",
                tasks=[
                    VendorTask(
                        id="v-c-1",
                        vendor_category="Venue, Civic Permissions & Licensing",
                        title="Obtain local municipal, society, and police permissions (NOC)",
                        description="Submit event timeline, expected attendance numbers, and noise permit documentation early.",
                        priority="high",
                    ),
                    VendorTask(
                        id="v-c-2",
                        vendor_category="Venue, Civic Permissions & Licensing",
                        title="Coordinate commercial power sanction and backup diesel generator",
                        description="Ensure audio, lighting, and food warmers do not trip local residential circuit breakers.",
                        priority="high",
                    ),
                ],
            ),
            VendorGroup(
                vendor="Inclusivity, Safety & First Aid",
                tasks=[
                    VendorTask(
                        id="v-c-3",
                        vendor_category="Inclusivity, Safety & First Aid",
                        title="Verify step-free wheelchair ramps and priority seating for seniors",
                        description="Ensure entrances, aisles, restrooms, and dining areas are fully accessible without barriers.",
                        priority="high",
                    ),
                    VendorTask(
                        id="v-c-4",
                        vendor_category="Inclusivity, Safety & First Aid",
                        title="Setup clearly marked First Aid medical kiosk with certified volunteer",
                        description="Equip with ice packs, bandages, ORS rehydration salts, and verified nearby ambulance emergency numbers.",
                        priority="high",
                    ),
                    VendorTask(
                        id="v-c-5",
                        vendor_category="Inclusivity, Safety & First Aid",
                        title="Map emergency evacuation routes and post illuminated exit signs",
                        description="Brief volunteer marshals on crowd flow, choke-point avoidance, and fire extinguisher stations.",
                        priority="high",
                    ),
                ],
            ),
            VendorGroup(
                vendor="Sound, AV & Stage Infrastructure",
                tasks=[
                    VendorTask(
                        id="v-c-6",
                        vendor_category="Sound, AV & Stage Infrastructure",
                        title="Contract sound engineer, wireless microphones, and acoustic check",
                        description="Schedule comprehensive audio test 2 hours before opening to prevent feedback and uneven coverage.",
                        priority="high",
                    ),
                    VendorTask(
                        id="v-c-7",
                        vendor_category="Sound, AV & Stage Infrastructure",
                        title="Erect stable stage riser, safety railings, and weather canopy",
                        description="Inspect structural stability of stage and waterproof protection for sensitive electronic equipment.",
                        priority="medium",
                    ),
                ],
            ),
            VendorGroup(
                vendor="Volunteer Coordination & Hospitality",
                tasks=[
                    VendorTask(
                        id="v-c-8",
                        vendor_category="Volunteer Coordination & Hospitality",
                        title="Assign functional leads for reception, crowd guidance, and dining",
                        description="Equip volunteers with high-visibility badges/sashes, written shift schedules, and two-way walkies.",
                        priority="high",
                    ),
                    VendorTask(
                        id="v-c-9",
                        vendor_category="Volunteer Coordination & Hospitality",
                        title="Coordinate drinking water dispensers and eco-friendly waste bins",
                        description="Provide clearly marked wet and dry waste stations and appoint a post-event clean-up squad.",
                        priority="medium",
                    ),
                ],
            ),
            VendorGroup(
                vendor="Publicity & Signage",
                tasks=[
                    VendorTask(
                        id="v-c-10",
                        vendor_category="Publicity & Signage",
                        title="Mount directional entrance banners, schedule board, and sponsor boards",
                        description="Position large-font schedule posters at eye level so attendees easily navigate program segments.",
                        priority="medium",
                    ),
                ],
            ),
        ]
