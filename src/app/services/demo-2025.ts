import { emptyKo, Team, Tournament } from '../models/tournament';

type TeamSeed = [nr: number, name: string, players: string[], rounds: number[]];

const GROUPS_2025: Record<string, TeamSeed[]> = {
  'Gruppe A': [
    [1, 's Znacht esch s Ziel', ['Adrian Hotz', 'David Spiess'], [1020, 1009, 1099, 781, 785]],
    [2, 'Magröndlis', ['Gian-Luca Kunz', 'Yanick Limacher'], [871, 875, 1036, 721, 839]],
    [3, "D'Schieber", ['Nora Weibel', 'Corina Schönenberger'], [864, 867, 848, 1098, 1023]],
    [4, 'Schällejäger', ['Mario Stofer', 'Simon Fähnrich'], [1013, 1237, 984, 1103, 861]],
    [5, 'Bier im Glas, Ass im Ärmel', ['Marcel Lang', 'Gregor Zemp'], [878, 1017, 900, 1163, 1099]],
    [6, 'Portberger/Sollmann', ['Jan Portmann', 'Richard Sollberger'], [1006, 647, 785, 786, 1045]],
  ],
  'Gruppe B': [
    [1, 'Stöck Wiis Stech Vol.3', ['Rinaldo Fellmann', 'Michael Bucher'], [1171, 961, 1207, 1049, 954]],
    [2, 'Schnatzdrossle', ['Melanie Burri', 'Sheyenne Albisser'], [955, 923, 823, 958, 956]],
    [3, "Achi's", ['Stephan Achermann', 'Regula Achermann'], [713, 1031, 759, 926, 1103]],
    [4, 'Die Nullpunkte Jasser', ['Andi Heini', 'Martin Schebath'], [1191, 1132, 1061, 835, 781]],
    [5, 'Bannerbräms', ['Oliver Schöpfer', 'Roger Halder'], [929, 752, 1125, 1150, 930]],
    [6, 'Hoppdebäse', ['Robin Wangler', 'Maurice Müller'], [693, 853, 677, 734, 928]],
  ],
  'Gruppe C': [
    [1, 'Rainer Wahnsinn', ['Martin Wyrsch', 'Rolf Zaugg'], [994, 1038, 1005, 1019, 1070]],
    [2, 'Nor do för de meter', ['Noe Durand', 'Pietro Di Berardino'], [1002, 846, 1008, 990, 1141]],
    [3, 'Duo unangenehm', ['Levin Waser', 'Matthias Stübi'], [890, 1020, 876, 1000, 949]],
    [4, 'Team Gschau', ['Roman Feer', 'Raphael Wildisen'], [882, 842, 897, 884, 814]],
    [5, 'Jasskönige', ['Enea Bossart', 'Jonas Rosenberg'], [1065, 864, 987, 865, 743]],
    [6, 'Bock, Bier, Blamage', ['Roman Schefer', 'Pascal Studhalter'], [819, 1042, 879, 894, 935]],
  ],
  'Gruppe D': [
    [1, 'Jhonnys', ['Patrik Heini', 'Senna'], [1188, 1140, 1055, 1025, 1078]],
    [2, 'Die jonge vom Schörch Benschi', ['Fabio Schürch', 'Marco Schürch'], [1050, 744, 878, 1013, 902]],
    [3, 'BockJägerinne', ['Vivien Bucher', 'Zoe Hanselmann'], [696, 899, 1006, 953, 1065]],
    [4, 'Generatione Jasser', ['Hanny Gemperli', 'Jan Achermann'], [834, 777, 1058, 859, 819]],
    [5, 'Hose abe', ['Luca Bertucci', 'Fabian Ehrler'], [742, 985, 826, 871, 806]],
    [6, 'Hüü Geiss!', ['Mario Aeschlimann', 'Marcel Wyss'], [1142, 1107, 829, 931, 982]],
  ],
  'Gruppe E': [
    [1, 'Bissig und breit', ['Heini Adolf', 'Dubach Marcel'], [1024, 962, 1165, 1156, 1027]],
    [2, 'Suufe chömmer au ned', ['Davide Di Berardino', 'Matteo Di Berardino'], [913, 922, 858, 741, 942]],
    [3, 'Team Schälle-UrsLy', ['Ursula Zimmermann', 'Lydia Burri'], [860, 993, 1026, 962, 933]],
    [4, 'Ass im Ärmel', ['Fabrice Bucher', 'Martin Faden'], [971, 821, 779, 728, 951]],
    [5, 'Kochi', ['Moni Stauffer', 'Livio Stauffer'], [969, 891, 1105, 1143, 857]],
    [6, 'Trippolibres', ['Dario Reddi', 'Fabian Limacher'], [915, 1063, 719, 922, 942]],
  ],
  'Gruppe F': [
    [1, "Jassassin's Creed", ['Vige von Ah', 'Elmar Fontana'], [922, 823, 922, 863, 1119]],
    [2, 'Eichlekäse', ['Noah Thürig', 'Sandro Roseberg'], [819, 1061, 937, 902, 726]],
    [3, 'Schoggistängeli & Schnäpsli', ['Thomas Dahinden', 'Nadia Dahinden'], [962, 1157, 947, 1026, 979]],
    [4, 'gibmirtrumpfsageneinhabekeinetrumpf', ['Elias Thürig', 'Gian Michel'], [1065, 764, 866, 1021, 905]],
    [5, 'Duo Schälle-Näll', ['Karin Marty', 'Laura Buholzer'], [992, 727, 1018, 982, 765]],
    [6, 'Amigos', ['Pascal Zimmermann', 'Emre Dincer'], [892, 1120, 962, 858, 1158]],
  ],
};

const FINAL_GROUPS_2025: Record<string, [teamName: string, rounds: number[]][]> = {
  'Finalgruppe 1': [
    ['Schällejäger', [542, 693, 703]],
    ['Die Nullpunkte Jasser', [714, 563, 579]],
    ['Jhonnys', [711, 693, 553]],
    ['Kochi', [545, 563, 677]],
  ],
  'Finalgruppe 2': [
    ['Bier im Glas, Ass im Ärmel', [521, 543, 627]],
    ['Nor do för de meter', [735, 776, 757]],
    ['Hüü Geiss!', [548, 713, 499]],
    ['Amigos', [708, 480, 629]],
  ],
  'Finalgruppe 3': [
    ['Stöck Wiis Stech Vol.3', [608, 702, 614]],
    ['Rainer Wahnsinn', [648, 628, 679]],
    ['Bissig und breit', [582, 554, 577]],
    ['Schoggistängeli & Schnäpsli', [674, 628, 642]],
  ],
};

export function demoTournament2025(): Tournament {
  const teams: Record<string, Team> = {};
  const byName: Record<string, string> = {};
  const t: Tournament = {
    name: 'Jassturnier 2025',
    year: 2025,
    groupRounds: 5,
    dropWorst: true,
    qualifiersPerGroup: 2,
    teams,
    groups: [],
    groupScores: {},
    finalRounds: 3,
    finalGroups: [],
    finalScores: {},
    ko: emptyKo(),
  };

  for (const [groupName, seeds] of Object.entries(GROUPS_2025)) {
    const letter = groupName.slice(-1).toLowerCase();
    const teamIds: string[] = [];
    for (const [nr, name, players, rounds] of seeds) {
      const id = `t-${letter}${nr}`;
      teams[id] = { id, name, players };
      byName[name] = id;
      teamIds.push(id);
      t.groupScores[id] = [...rounds];
    }
    t.groups.push({ id: `g-${letter}`, name: groupName, teamIds });
  }

  for (const [groupName, seeds] of Object.entries(FINAL_GROUPS_2025)) {
    const nr = groupName.slice(-1);
    const teamIds: string[] = [];
    for (const [teamName, rounds] of seeds) {
      const id = byName[teamName];
      teamIds.push(id);
      t.finalScores[id] = [...rounds];
    }
    t.finalGroups.push({ id: `fg-${nr}`, name: groupName, teamIds });
  }

  t.ko = {
    hf1: {
      teamA: byName['Nor do för de meter'],
      teamB: byName['Schoggistängeli & Schnäpsli'],
      pointsA: 651,
      pointsB: 605,
    },
    hf2: {
      teamA: byName['Rainer Wahnsinn'],
      teamB: byName['Jhonnys'],
      pointsA: 568,
      pointsB: 688,
    },
    kleinerFinal: {
      teamA: byName['Schoggistängeli & Schnäpsli'],
      teamB: byName['Rainer Wahnsinn'],
      pointsA: null,
      pointsB: null,
    },
    final: {
      teamA: byName['Nor do för de meter'],
      teamB: byName['Jhonnys'],
      pointsA: null,
      pointsB: null,
    },
  };

  return t;
}
