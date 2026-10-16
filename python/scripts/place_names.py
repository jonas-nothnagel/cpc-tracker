"""Names that would tie a demonstration country to a real one.

Country X is shared on its own, so nothing it shows may name a real country:
not a country, its capital or main city, its people or language adjective, its
currency, or a region narrow enough to point at one country. This module holds
those lists (project-defined reference lists, written out by hand) and one
scan. Treaty and convention names that carry a place ("Paris Agreement",
"Kunming-Montreal Global Biodiversity Framework") name the instrument, not the
country, and are skipped. "US$" is the demo's currency of account and skipped.

Used by the Country X build (scripts/build_countryx_layers.py) and its test,
which scans every Country X file, the AI's explanations included.
"""

from __future__ import annotations

import re

COUNTRIES = [
    "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua", "Barbuda", "Argentina", "Armenia",
    "Australia", "Austria", "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium",
    "Belize", "Benin", "Bhutan", "Bolivia", "Bosnia", "Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria",
    "Burkina Faso", "Burundi", "Cabo Verde", "Cape Verde", "Cambodia", "Kampuchea", "Cameroon", "Canada",
    "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros", "Congo", "DRC", "Costa Rica",
    "Côte d'Ivoire", "Cote d'Ivoire", "Côte d’Ivoire", "Ivory Coast", "Croatia", "Cuba", "Cyprus", "Czechia",
    "Czech Republic", "Denmark", "Djibouti", "Dominica", "Dominican Republic", "Ecuador", "Egypt", "El Salvador",
    "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Swaziland", "Ethiopia", "Fiji", "Finland", "France",
    "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea", "Guinea-Bissau",
    "Guyana", "Haiti", "Honduras", "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel",
    "Italy", "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kiribati", "Kuwait", "Kyrgyzstan", "Laos",
    "Lao PDR", "Lao People's Democratic Republic", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya",
    "Liechtenstein", "Lithuania", "Luxembourg", "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta",
    "Marshall Islands", "Mauritania", "Mauritius", "Mexico", "Micronesia", "Moldova", "Monaco", "Mongolia",
    "Montenegro", "Morocco", "Mozambique", "Myanmar", "Burma", "Namibia", "Nauru", "Nepal", "Netherlands",
    "Holland", "New Zealand", "Aotearoa", "Nicaragua", "Niger", "Nigeria", "North Korea", "DPRK", "North Macedonia",
    "Macedonia", "Norway", "Oman", "Pakistan", "Palau", "Palestine", "Panama", "Panamá", "Papua New Guinea",
    "Paraguay", "Peru", "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Russia", "Russian Federation",
    "Rwanda", "Saint Kitts", "Nevis", "Saint Lucia", "Saint Vincent", "Grenadines", "Samoa", "San Marino",
    "Sao Tome", "São Tomé", "Principe", "Príncipe", "Saudi Arabia", "Senegal", "Serbia", "Seychelles",
    "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands", "Somalia", "South Africa",
    "South Korea", "Republic of Korea", "Korea", "South Sudan", "Spain", "Sri Lanka", "Ceylon", "Sudan",
    "Suriname", "Sweden", "Switzerland", "Syria", "Tajikistan", "Tanzania", "Zanzibar", "Thailand", "Timor-Leste",
    "East Timor", "Togo", "Tonga", "Trinidad", "Tobago", "Tunisia", "Türkiye", "Turkiye", "Turkey",
    "Turkmenistan", "Tuvalu", "Uganda", "Ukraine", "United Arab Emirates", "UAE", "United Kingdom", "Britain",
    "Great Britain", "England", "Scotland", "Wales", "Northern Ireland", "United States", "USA", "U.S.A.",
    "America", "Uruguay", "Uzbekistan", "Vanuatu", "Venezuela", "Viet Nam", "Vietnam", "Yemen", "Zambia",
    "Zimbabwe", "Kosovo", "Taiwan", "Holy See", "Vatican", "Greenland", "Puerto Rico", "Hong Kong", "Macao",
    "Macau", "New Caledonia", "French Polynesia", "Western Sahara",
]

CAPITALS_AND_CITIES = [
    "Kabul", "Tirana", "Algiers", "Luanda", "Buenos Aires", "Yerevan", "Canberra", "Sydney", "Melbourne", "Vienna",
    "Baku", "Nassau", "Manama", "Dhaka", "Chittagong", "Bridgetown", "Minsk", "Brussels", "Belmopan", "Porto-Novo",
    "Cotonou", "Thimphu", "La Paz", "Sucre", "Sarajevo", "Gaborone", "Brasília", "Brasilia", "São Paulo",
    "Sao Paulo", "Rio de Janeiro", "Bandar Seri Begawan", "Sofia", "Ouagadougou", "Gitega", "Bujumbura", "Praia",
    "Phnom Penh", "Siem Reap", "Battambang", "Yaoundé", "Yaounde", "Douala", "Ottawa", "Toronto", "Vancouver",
    "Bangui", "N'Djamena", "Santiago", "Beijing", "Shanghai", "Bogotá", "Bogota", "Medellín", "Moroni",
    "Brazzaville", "Kinshasa", "San José", "Yamoussoukro", "Abidjan", "Zagreb", "Havana", "Nicosia", "Prague",
    "Copenhagen", "Roseau", "Santo Domingo", "Quito", "Guayaquil", "Cairo", "Alexandria", "San Salvador",
    "Malabo", "Asmara", "Tallinn", "Mbabane", "Addis Ababa", "Suva", "Helsinki", "Paris", "Libreville", "Banjul",
    "Tbilisi", "Berlin", "Accra", "Athens", "Guatemala City", "Conakry", "Bissau", "Georgetown", "Port-au-Prince",
    "Tegucigalpa", "Budapest", "Reykjavík", "Reykjavik", "New Delhi", "Delhi", "Mumbai", "Kolkata", "Chennai",
    "Jakarta", "Tehran", "Baghdad", "Dublin", "Jerusalem", "Tel Aviv", "Rome", "Milan", "Kingston", "Tokyo",
    "Amman", "Astana", "Almaty", "Nairobi", "Mombasa", "Tarawa", "Kuwait City", "Bishkek", "Vientiane", "Riga",
    "Beirut", "Maseru", "Monrovia", "Tripoli", "Vaduz", "Vilnius", "Antananarivo", "Lilongwe", "Kuala Lumpur",
    "Malé", "Bamako", "Valletta", "Majuro", "Nouakchott", "Port Louis", "Mexico City", "Palikir", "Chișinău",
    "Chisinau", "Ulaanbaatar", "Ulan Bator", "Podgorica", "Rabat", "Casablanca", "Maputo", "Naypyidaw", "Yangon",
    "Rangoon", "Mandalay", "Windhoek", "Kathmandu", "Amsterdam", "The Hague", "Wellington", "Auckland", "Managua",
    "Niamey", "Abuja", "Lagos", "Pyongyang", "Skopje", "Oslo", "Muscat", "Islamabad", "Karachi", "Lahore",
    "Ngerulmud", "Panama City", "Port Moresby", "Asunción", "Asuncion", "Lima", "Manila", "Warsaw", "Lisbon",
    "Doha", "Bucharest", "Moscow", "Kigali", "Basseterre", "Castries", "Kingstown", "Apia", "Riyadh", "Dakar",
    "Belgrade", "Freetown", "Ljubljana", "Bratislava", "Honiara", "Mogadishu", "Pretoria", "Cape Town",
    "Johannesburg", "Durban", "Seoul", "Busan", "Juba", "Madrid", "Barcelona", "Colombo", "Kandy",
    "Sri Jayawardenepura Kotte", "Khartoum", "Paramaribo", "Stockholm", "Bern", "Geneva", "Zurich", "Damascus",
    "Dushanbe", "Dodoma", "Dar es Salaam", "Bangkok", "Chiang Mai", "Dili", "Lomé", "Nuku'alofa", "Port of Spain",
    "Tunis", "Ankara", "Istanbul", "Ashgabat", "Funafuti", "Kampala", "Kyiv", "Kiev", "Abu Dhabi", "Dubai",
    "London", "Washington", "New York", "Montevideo", "Tashkent", "Port Vila", "Caracas", "Hanoi",
    "Ho Chi Minh City", "Saigon", "Sanaa", "Lusaka", "Harare", "Pristina", "Taipei", "Kunming", "Montreal",
    "Glasgow", "Sharm el-Sheikh", "Marrakech", "Marrakesh", "Bonn", "Cancún", "Cancun", "Nagoya", "Kyoto",
    "Aichi", "Cartagena", "Rotterdam", "Basel", "Minamata", "Sendai", "Ramsar", "Victoria",
]

PEOPLES = [
    "Afghan", "Albanian", "Algerian", "Angolan", "Argentine", "Argentinian", "Armenian", "Australian", "Austrian",
    "Azerbaijani", "Bahamian", "Bahraini", "Bangladeshi", "Bengali", "Barbadian", "Belarusian", "Belgian",
    "Belizean", "Beninese", "Bhutanese", "Bolivian", "Bosnian", "Motswana", "Batswana", "Brazilian", "Bruneian",
    "Bulgarian", "Burkinabe", "Burkinabè", "Burundian", "Cambodian", "Khmer", "Cameroonian", "Canadian", "Chadian",
    "Chilean", "Chinese", "Colombian", "Comorian", "Congolese", "Costa Rican", "Ivorian", "Croatian", "Cuban",
    "Cypriot", "Czech", "Danish", "Djiboutian", "Dominican", "Ecuadorian", "Egyptian", "Salvadoran", "Eritrean",
    "Estonian", "Swazi", "Ethiopian", "Fijian", "Finnish", "Gabonese", "Gambian", "Georgian", "German",
    "Ghanaian", "Greek", "Grenadian", "Guatemalan", "Guinean", "Guyanese", "Haitian", "Honduran", "Hungarian",
    "Icelandic", "Indian", "Indonesian", "Iranian", "Persian", "Iraqi", "Irish", "Israeli", "Italian", "Jamaican",
    "Japanese", "Jordanian", "Kazakh", "Kenyan", "Kuwaiti", "Kyrgyz", "Lao", "Laotian", "Latvian", "Lebanese",
    "Liberian", "Libyan", "Lithuanian", "Malagasy", "Malawian", "Malaysian", "Malay", "Maldivian", "Malian",
    "Maltese", "Mauritanian", "Mauritian", "Mexican", "Moldovan", "Mongolian", "Mongol", "Montenegrin",
    "Moroccan", "Mozambican", "Burmese", "Namibian", "Nepali", "Nepalese", "Dutch", "New Zealander", "Kiwi",
    "Nicaraguan", "Nigerien", "Nigerian", "North Korean", "Macedonian", "Norwegian", "Omani", "Pakistani",
    "Palauan", "Palestinian", "Panamanian", "Papuan", "Paraguayan", "Peruvian", "Filipino", "Philippine",
    "Polish", "Qatari", "Romanian", "Russian", "Rwandan", "Samoan", "Saudi", "Senegalese", "Serbian",
    "Seychellois", "Sierra Leonean", "Singaporean", "Slovak", "Slovenian", "Somali", "South African",
    "South Korean", "Korean", "South Sudanese", "Sri Lankan", "Sinhala", "Sinhalese", "Sudanese", "Surinamese",
    "Swedish", "Swiss", "Syrian", "Tajik", "Tanzanian", "Thai", "Timorese", "Togolese", "Tongan", "Trinidadian",
    "Tunisian", "Turkish", "Turkmen", "Tuvaluan", "Ugandan", "Ukrainian", "Emirati", "British", "American",
    "Uruguayan", "Uzbek", "Ni-Vanuatu", "Venezuelan", "Vietnamese", "Yemeni", "Zambian", "Zimbabwean", "Kosovar",
    "Taiwanese", "French", "Spanish", "Portuguese", "Arab", "Arabic", "Hindi", "Urdu", "Swahili", "Amharic",
    "Tagalog", "Tamil",
]

CURRENCIES = [
    "riel", "baht", "kyat", "rupee", "rupees", "rupiah", "ringgit", "pesos", "balboa", "balboas", "colón",
    "colones", "quetzal", "lempira", "córdoba", "boliviano", "guaraní", "bolívar", "naira", "cedi", "shilling",
    "shillings", "birr", "dirham", "dinar", "riyal", "rial", "lira", "lari", "dram", "manat", "tenge", "somoni",
    "afghani", "taka", "ngultrum", "kwacha", "kwanza", "pula", "loti", "lilangeni", "ariary", "ouguiya", "dalasi",
    "CFA", "yen", "yuan", "renminbi", "RMB", "tugrik", "tögrög", "togrog", "ruble", "rouble", "hryvnia", "zloty",
    "forint", "koruna", "krona", "krone", "leu", "lev", "MNT", "PAB", "LKR", "XOF", "KHR", "VND", "THB", "IDR",
    "PHP", "INR", "PKR", "BDT", "KES", "NGN", "ZAR", "BRL", "MXN", "PEN", "CLP", "ARS", "EUR",
    "GBP", "JPY", "CNY",
]
# Not listed: "COP" (also the Conference of the Parties) and "GHS" (also the
# chemicals labelling system), which policy text uses far more often.

# Regions narrow enough to point at one country or a handful of them.
REGIONS = [
    "Mekong", "Tonle Sap", "Gobi", "Sahel", "Sahara", "Amazon", "Amazonia", "Amazonian", "Andes", "Andean",
    "Himalaya", "Himalayas", "Himalayan", "Siberia", "Siberian", "Balkan", "Balkans", "Baltic", "Nordic",
    "Mediterranean", "Middle East", "Caribbean", "Central America", "Central American", "South America",
    "Latin America", "Latin American", "North America", "West Africa", "East Africa", "Southern Africa",
    "Central Asia", "Southeast Asia", "South Asia", "Horn of Africa", "Lake Chad", "Lake Victoria", "Congo Basin",
    "Nile", "Niger Delta", "Ganges", "Indus", "Yangtze", "Danube", "Rhine", "Zambezi", "Okavango", "Kalahari",
    "Namib", "Atacama", "Patagonia", "Borneo", "Sumatra", "Java", "Mindanao", "Luzon", "Bengal", "Punjab",
    "Kashmir", "Tibet", "Tibetan", "Xinjiang", "Yunnan", "Mesoamerica", "Mesoamerican", "Polynesia",
    "Polynesian", "Melanesia", "Melanesian", "Cardamom", "Kilimanjaro", "Serengeti", "Galápagos", "Galapagos",
    "Darién", "Darien", "Tonlé Sap", "Irrawaddy", "Ayeyarwady", "Chao Phraya", "Red River Delta",
    "Brahmaputra", "Orinoco", "Paraná", "Pantanal", "Chaco", "Yucatán", "Yucatan", "Altai", "Khangai", "Steppe",
    "ASEAN", "SADC", "ECOWAS", "CARICOM", "Mercosur", "African Union", "European Union", "Africa", "African",
    "Asia", "Asian", "Europe", "European", "Oceania",
]

# Instrument names that carry a place: they name the treaty, not a country.
INSTRUMENTS = [
    r"Paris Agreement", r"Paris Climate Agreement", r"Kunming[-‐–]Montreal", r"Kyoto Protocol",
    r"Montreal Protocol", r"Nagoya Protocol", r"Nagoya[-‐–]Kuala Lumpur", r"Cartagena Protocol",
    r"Sendai Framework", r"Aichi (?:Biodiversity )?Targets?", r"Ramsar (?:Convention|[Ss]ites?|Wetlands?)",
    r"Bonn Challenge", r"Rio Conventions?", r"Rio Markers?", r"Glasgow (?:Climate Pact|Leaders)",
    r"Lima [Ww]ork [Pp]rogramme", r"Marrakech Partnership", r"Doha Amendment", r"Stockholm Convention",
    r"Basel Convention", r"Rotterdam Convention", r"Minamata Convention", r"Vienna Convention",
    r"Addis Ababa Action Agenda", r"Sharm el-Sheikh (?:Implementation Plan|adaptation agenda)",
    r"UAE Framework for Global Climate Resilience",
    r"(?:Paris|Ramsar|Aichi|Sendai)[-‐–](?:aligned|compatible|consistent|listed|designated|type)",
    r"US\$", r"USD", r"Euro[- ]?[0-6]\b",
    r"United Nations", r"UN Decade",
]

# Words that are also ordinary English, matched only as written (capitalised
# or upper case), so "chad" or "turkey" in running text never trip the scan.
_CASED = {"Chad", "Georgia", "Jordan", "Turkey", "Guinea", "Niger", "China", "Victoria", "Nevis", "Lao", "Malay",
          "Kiwi", "Arab", "Indian", "Tamil", "Korea", "Java", "Nile", "Steppe", "America", "American", "Mali",
          "Tonga", "Togo", "Peru", "Cuba", "Oman", "Iran", "Iraq", "Chile", "Benin", "Gabon", "Wales", "Lima",
          "Nauru", "Palau", "Samoa", "Fiji", "Malta", "Monaco", "Dominica", "Grenada", "Bonn", "Basel",
          "Paris", "Sendai", "Ramsar", "Kingston", "Georgetown", "Santiago", "Asia", "Africa",
          "African", "Asian", "Europe", "European", "Oceania", "Cardamom", "Polish"}
_UNCASED_LISTS = (COUNTRIES, CAPITALS_AND_CITIES, PEOPLES, REGIONS)


def _pattern(words: list[str], flags: int) -> re.Pattern[str]:
    # A hyphen does not end a name: "China-Mongolia" and "UB-based" still match.
    alternation = "|".join(re.escape(w) for w in sorted(set(words), key=len, reverse=True))
    return re.compile(r"(?<!\w)(?:" + alternation + r")(?!\w)", flags)


_ANY_CASE = _pattern([w for lst in _UNCASED_LISTS for w in lst if w not in _CASED], re.IGNORECASE)
_AS_WRITTEN = _pattern([w for lst in _UNCASED_LISTS for w in lst if w in _CASED], 0)
_CURRENCY = _pattern(CURRENCIES, 0)
# Treaty names in any case: "the Paris agreement", "the Aichi targets".
_INSTRUMENT = re.compile("|".join(f"(?:{p})" for p in INSTRUMENTS), re.IGNORECASE)


def place_names(text: str) -> list[str]:
    """Every name in `text` that ties it to a real country, region or
    currency, in order of appearance; treaty names are skipped."""
    clean = _INSTRUMENT.sub(" ", text)
    found = [(m.start(), m.group(0)) for p in (_ANY_CASE, _AS_WRITTEN, _CURRENCY) for m in p.finditer(clean)]
    return [name for _, name in sorted(found)]
