// Name stocks: Latin and Greek, the Romance languages, Hungarian and the
// Slavic languages. See src/naming/stocks/index.js for the shape.

export default [
    {
        id: 'latin', label: 'Latin', detect: ['rome', 'roman', 'romans', 'latin', 'republic of rome', 'imperial rome', 'legion', 'pompeii'],
        era: 'classical', convention: 'roman', adjective: ['ian', 'an', 'ine'],
        // Training names: the cognomina and later single names, which carry
        // the sound of the language far better than the eighteen praenomina.
        given: {
            m: 'Marcus Gaius Lucius Publius Quintus Titus Gnaeus Aulus Decimus Servius Tiberius Sextus Spurius Manius Appius Numerius Agrippa Aurelius Augustus Brutus Caesar Cassius Cato Cicero Crassus Drusus Flavius Gallus Germanicus Hadrianus Julianus Lepidus Longinus Lucanus Marcellus Maximus Nero Octavius Otho Paullus Piso Pompeius Quirinus Regulus Rufus Scipio Seneca Severus Silvanus Sulla Tacitus Valerius Varro Vespasianus Corvinus Faustus Felix Fortunatus Laurentius Magnus Valens',
            f: 'Julia Cornelia Claudia Aemilia Valeria Fabia Licinia Sempronia Tullia Junia Antonia Octavia Pompeia Sulpicia Caecilia Domitia Flavia Aurelia Livia Agrippina Lucretia Calpurnia Porcia Servilia Terentia Fulvia Clodia Hortensia Marcia Popilia Vipsania Messalina Faustina Lucilla Sabina Plotina Marciana Matidia Galeria Helena Placidia Severa Paulina Prisca Tertia Secunda Maxima Rufina Lucia Vibia Iunia Annia Cassia Plautia',
        },
        family: 'Julius Cornelius Claudius Aemilius Valerius Fabius Licinius Sempronius Tullius Junius Antonius Octavius Pompeius Sulpicius Caecilius Domitius Flavius Aurelius Livius Calpurnius Porcius Servilius Terentius Fulvius Clodius Hortensius Marcius Popilius Vipsanius Manlius Postumius Quinctius Furius Papirius Atilius Duilius Hostilius Horatius Lucretius Minucius Mucius Nonius Ovidius Petronius Plautius Plinius Sergius Sextius Tarquinius Ulpius Vettius Vibius Annius Cassius Didius Gellius',
        bynames: 'Caesar Scipio Cicero Rufus Brutus Crassus Naso Varro Cato Lentulus Balbus Longus Maximus Paullus Gallus Metellus Lepidus Piso Sulla Agricola Albinus Asina Barbatus Bibulus Calvus Catulus Cotta Dentatus Dolabella Flaccus Gracchus Laenas Lucullus Marcellus Merula Nasica Nerva Pulcher Regulus Sabinus Scaurus Severus Silanus Strabo Torquatus Vatia Verres Vitulus',
        roman: { praenomina: 'Gaius Lucius Marcus Publius Quintus Titus Gnaeus Aulus Decimus Servius Tiberius Sextus Spurius Manius Appius Numerius Kaeso Mamercus' },
        places: {
            words: { river: 'flumen', hill: 'collis', mountain: 'mons', valley: 'vallis', lake: 'lacus', sea: 'mare', wood: 'silva', field: 'campus', stone: 'saxum', ford: 'vadum', bridge: 'pons', island: 'insula', marsh: 'palus', spring: 'fons', fort: 'castra', town: 'oppidum', black: 'niger', white: 'albus', red: 'ruber', green: 'viridis', old: 'vetus', new: 'novus', high: 'altus', holy: 'sacer', iron: 'ferrum', wolf: 'lupus', oak: 'quercus', eagle: 'aquila', gold: 'aurum', sun: 'sol', moon: 'luna' },
            endings: [['ium', 'place of'], ['ia', 'land of'], ['um', 'place'], ['ensis', 'of'], ['anum', 'estate of'], ['acum', 'estate of'], ['castra', 'camp'], ['polis', 'city'], ['burgum', 'fort'], ['dunum', 'hillfort'], ['magus', 'market'], ['ona', 'town']],
            starts: [['Forum ', 'market of'], ['Castra ', 'camp of'], ['Aquae ', 'waters of'], ['Portus ', 'harbour of'], ['Colonia ', 'colony of']],
        },
    },
    {
        id: 'ancient_greek', label: 'Ancient Greek', detect: ['athens', 'sparta', 'ancient greece', 'hellenic', 'hellas', 'thebes', 'corinth', 'troy', 'olympus'],
        era: 'classical', convention: 'greek', adjective: ['ian', 'ean'],
        given: {
            m: 'Alexandros Perikles Themistokles Leonidas Sokrates Platon Aristoteles Demosthenes Alkibiades Kimon Miltiades Xenophon Thukydides Herodotos Sophokles Euripides Aischylos Aristophanes Pythagoras Herakleitos Demokritos Epikouros Diogenes Lysandros Agesilaos Pausanias Brasidas Nikias Kleon Pelopidas Epameinondas Philippos Antipatros Ptolemaios Seleukos Antigonos Demetrios Kallias Hippias Hipparchos Kleisthenes Solon Drakon Lykourgos Menelaos Agamemnon Odysseus Achilleus Aias Diomedes Nestor Hektor Iason Theseus Perseus Kadmos Orestes Telemachos',
            f: 'Aspasia Sappho Hypatia Kleopatra Olympias Arsinoe Berenike Laodike Phryne Lais Agariste Gorgo Kyniska Telesilla Korinna Praxilla Myrtis Theano Diotima Hipparchia Elpinike Xanthippe Penelope Helene Andromache Hekabe Kassandra Klytaimnestra Elektra Iphigeneia Antigone Ismene Iokaste Medeia Ariadne Phaidra Alkestis Hermione Kallisto Daphne Danae Europa Io Leda Niobe Thais Myrrhine Lysistrata Kalliope Eirene Chloe',
        },
        places: {
            words: { river: 'potamos', hill: 'lophos', mountain: 'oros', valley: 'nape', lake: 'limne', sea: 'thalassa', wood: 'hyle', field: 'agros', stone: 'lithos', bridge: 'gephyra', island: 'nesos', marsh: 'helos', spring: 'krene', fort: 'akra', harbour: 'limen', black: 'melas', white: 'leukos', red: 'erythros', green: 'chloros', old: 'palaios', new: 'neos', high: 'akros', holy: 'hieros', iron: 'sideros', wolf: 'lykos', oak: 'drys', olive: 'elaia', sun: 'helios', moon: 'selene', horse: 'hippos', lion: 'leon' },
            endings: [['polis', 'city'], ['os', ''], ['eia', 'place of'], ['ion', 'shrine of'], ['nesos', 'island'], ['akra', 'height'], ['ousa', 'rich in'], ['ai', 'town'], ['ia', 'land of'], ['eion', 'sanctuary of']],
        },
    },
    {
        id: 'byzantine_greek', label: 'Byzantine Greek', detect: ['byzantine', 'byzantium', 'constantinople', 'eastern roman'],
        era: 'medieval', convention: 'byzantine', adjective: ['ian', 'ine'],
        given: {
            m: 'Ioannes Konstantinos Michael Theodoros Nikephoros Basileios Leon Alexios Andronikos Manuel Isaakios Romanos Georgios Demetrios Nikolaos Stephanos Theophilos Bardas Leontios Herakleios Justinianos Belisarios Narses Ioustinos Tiberios Maurikios Phokas Konstans Philippikos Artabasdos Staurakios Eustathios Gregorios Ignatios Photios Prokopios Symeon Arsenios Euthymios Kallinikos Kosmas Lazaros Methodios Niketas Pankratios Sergios Sophronios Theodosios Theophanes Anastasios',
            f: 'Theodora Eirene Zoe Anna Maria Eudokia Helene Sophia Theophano Euphrosyne Ariadne Pulcheria Martina Konstantina Kassia Eudoxia Athenais Thekla Xene Bertha Agnes Aikaterine Euphemia Philothei Simonis Theodote Kale Melissa Dobrodeia Stephanie Basilissa Anastasia Christina Euprepia Makrina Olympias Paraskeve Thomais Barbara Eugenia Euthymia Georgia Kyriake',
        },
        family: 'Komnenos Doukas Palaiologos Angelos Laskaris Kantakouzenos Phokas Skleros Botaneiates Bryennios Dalassenos Mouzalon Tzimiskes Argyros Melissenos Batatzes Raoul Tornikes Kamateros Branas Kontostephanos Synadenos Philanthropenos Tarchaneiotes Metochites Choniates Akropolites Xiphilinos Psellos Keroularios Monomachos Diogenes Kourkouas Lekapenos Krateros Maleinos Dermokaites Gabras Taronites Vatatzes Strategopoulos Asanes Kabasilas Notaras Chalkokondyles Sphrantzes Bessarion Rhaoul Glabas Tzamplakon',
        places: {
            words: { river: 'potamos', hill: 'bounos', mountain: 'oros', valley: 'lakkos', lake: 'limne', sea: 'thalassa', wood: 'dasos', field: 'chorion', stone: 'petra', bridge: 'gephyra', island: 'nesos', fort: 'kastron', harbour: 'limen', church: 'naos', monastery: 'mone', black: 'mavros', white: 'aspros', red: 'kokkinos', old: 'palaios', new: 'neos', high: 'hypselos', holy: 'hagios', iron: 'sideros', wolf: 'lykos', gold: 'chrysos', eagle: 'aetos' },
            endings: [['polis', 'city'], ['kastron', 'castle'], ['oupolis', 'city of'], ['ion', 'place of'], ['mone', 'monastery'], ['chorion', 'village'], ['kome', 'village']],
            starts: [['Hagia ', 'holy'], ['Hagios ', 'saint'], ['Neo', 'new'], ['Palaio', 'old'], ['Chryso', 'golden']],
        },
    },
    {
        id: 'italian', label: 'Italian', detect: ['italy', 'italian', 'florence', 'venice', 'milan', 'naples', 'sicily', 'genoa', 'tuscany'],
        era: 'modern', convention: 'western', adjective: ['ese', 'ano', 'ino'],
        given: {
            m: 'Giuseppe Giovanni Antonio Mario Luigi Francesco Angelo Vincenzo Pietro Salvatore Carlo Franco Domenico Bruno Paolo Michele Giorgio Aldo Sergio Luciano Roberto Marco Andrea Alessandro Lorenzo Leonardo Mattia Gabriele Tommaso Riccardo Edoardo Matteo Federico Davide Simone Filippo Giacomo Niccolò Pietro Enzo Vittorio Ettore Massimo Fabrizio Stefano Cesare Dario Emilio Fausto Guido Ignazio Lapo Ottavio Raffaele Ugo',
            f: 'Maria Anna Giuseppina Rosa Angela Giovanna Teresa Lucia Carmela Caterina Francesca Antonietta Carla Elena Concetta Rita Margherita Franca Paola Laura Giulia Sofia Aurora Alice Ginevra Emma Giorgia Beatrice Greta Martina Chiara Anna Vittoria Ludovica Matilde Bianca Isabella Livia Allegra Arianna Camilla Costanza Elisa Fiamma Gemma Ilaria Lavinia Noemi Ottavia Serena Simonetta Viola Lucrezia Donatella',
        },
        family: 'Rossi Russo Ferrari Esposito Bianchi Romano Colombo Ricci Marino Greco Bruno Gallo Conti De_Luca Mancini Costa Giordano Rizzo Lombardi Moretti Barbieri Fontana Santoro Mariani Rinaldi Caruso Ferrara Galli Martini Leone Longo Gentile Martinelli Vitale Lombardo Serra Coppola De_Santis Ferri Fabbri Bellini Grasso Valentini Messina Sala Pellegrini Palumbo Sanna Farina Rizzi Monti Cattaneo Morelli Amato Silvestri Mazza Testa Grassi Pellegrino Carbone Giuliani Benedetti Barone Rossetti Caputo Montanari Guerra Palmieri Bernardi Martino Fiore De_Rosa Ferretti Bellucci Basile Riva Donati Piras Vitali Battaglia Sartori Neri Costantini Milani Orlando Ruggiero Brambilla',
        oldFamily: 'Medici Sforza Visconti Este Gonzaga Borgia Orsini Colonna Farnese Malatesta Montefeltro Strozzi Pazzi Albizzi Bardi Peruzzi Rucellai Tornabuoni Doria Grimaldi Spinola Fieschi Contarini Morosini Dandolo Foscari Mocenigo Gradenigo Barbarigo Loredan Corner Querini Tiepolo Scaligeri Carrara Bentivoglio Baglioni Vitelli Caetani Chigi Barberini Aldobrandini Borghese Pallavicini',
        places: {
            words: { river: 'fiume', hill: 'colle', mountain: 'monte', valley: 'valle', lake: 'lago', sea: 'mare', wood: 'bosco', field: 'campo', stone: 'pietra', ford: 'guado', bridge: 'ponte', island: 'isola', marsh: 'palude', spring: 'fonte', fort: 'rocca', castle: 'castello', black: 'nero', white: 'bianco', red: 'rosso', green: 'verde', old: 'vecchio', new: 'nuovo', high: 'alto', holy: 'santo', iron: 'ferro', wolf: 'lupo', oak: 'quercia', olive: 'ulivo', star: 'stella', sun: 'sole' },
            endings: [['ano', 'estate of'], ['ella', 'little'], ['ino', 'little'], ['ona', 'town'], ['ate', 'place of'], ['ago', 'estate'], ['enza', 'place'], ['ia', 'land'], ['oli', 'town'], ['era', 'place']],
            starts: [['San ', 'Saint'], ['Santa ', 'Saint'], ['Monte', 'mount'], ['Castel', 'castle'], ['Porto ', 'harbour'], ['Borgo ', 'town of'], ['Villa ', 'villa of'], ['Rocca', 'fortress']],
        },
        businesses: ['Trattoria {given}', 'Bar {word}', 'Caffè {family}', 'Osteria del {noun}', 'Pizzeria {given}', '{family} e Figli'],
    },
    {
        id: 'spanish', label: 'Spanish', detect: ['spain', 'spanish', 'madrid', 'barcelona', 'seville', 'castile', 'andalusia', 'aragon'],
        era: 'modern', convention: 'spanish', adjective: ['ano', 'eño', 'és'],
        given: {
            m: 'Antonio José Manuel Francisco David Juan Javier Daniel José_Antonio Francisco_Javier Carlos Jesús Alejandro Miguel Rafael Pedro Pablo Ángel Sergio Fernando Luis Jorge Alberto Álvaro Diego Adrián Raúl Enrique Ramón Vicente Iván Rubén Óscar Andrés Joaquín Santiago Eduardo Víctor Roberto Mario Ignacio Alfonso Marcos Hugo Martín Lucas Mateo Leo Gonzalo Rodrigo Íñigo Hernán Gaspar Baltasar Esteban Tomás Bernardo',
            f: 'María Carmen Ana Isabel Laura Cristina Marta Lucía Pilar Elena Dolores Paula Sara Rosa Raquel Mercedes Manuela Teresa Beatriz Julia Silvia Patricia Rocío Montserrat Encarnación Alba Irene Andrea Nuria Inmaculada Sofía Martina Valeria Daniela Carla Claudia Alicia Lorena Esther Noelia Verónica Ángela Natalia Eva Inés Ximena Blanca Leonor Consuelo Remedios Amparo Esperanza Milagros Soledad Catalina',
        },
        family: 'García Rodríguez González Fernández López Martínez Sánchez Pérez Gómez Martín Jiménez Ruiz Hernández Díaz Moreno Muñoz Álvarez Romero Alonso Gutiérrez Navarro Torres Domínguez Vázquez Ramos Gil Ramírez Serrano Blanco Molina Morales Suárez Ortega Delgado Castro Ortiz Rubio Marín Sanz Núñez Iglesias Medina Garrido Cortés Castillo Santos Lozano Guerrero Cano Prieto Méndez Cruz Calvo Gallego Vidal León Márquez Herrera Peña Flores Cabrera Campos Vega Fuentes Carrasco Diez Caballero Reyes Nieto Aguilar Pascual Santana Herrero Lorenzo Montero Hidalgo Giménez Ibáñez Ferrer Durán Santiago Benítez Mora Vicente Vargas Arias Carmona Crespo Román Pastor Soto Sáez Velasco Moya Soler Parra Esteban Bravo Gallardo Rojas',
        oldFamily: 'de_Mendoza de_Guzmán de_Toledo de_Velasco Enríquez Pimentel Manrique de_Lara Pacheco Ponce_de_León de_la_Cerda Fernández_de_Córdoba Álvarez_de_Toledo de_Zúñiga Osorio Téllez-Girón de_Haro de_Castro de_Silva de_Borja de_Luna de_Mendoza de_Ayala Carrillo Girón de_Sotomayor de_Quiñones de_Benavides de_Cárdenas de_Figueroa',
        places: {
            words: { river: 'río', hill: 'cerro', mountain: 'sierra', valley: 'valle', lake: 'lago', sea: 'mar', wood: 'bosque', field: 'campo', stone: 'piedra', ford: 'vado', bridge: 'puente', island: 'isla', marsh: 'marisma', spring: 'fuente', fort: 'castillo', tower: 'torre', black: 'negro', white: 'blanco', red: 'rojo', green: 'verde', old: 'viejo', new: 'nuevo', high: 'alto', holy: 'santo', iron: 'hierro', wolf: 'lobo', oak: 'roble', olive: 'olivo', eagle: 'águila', silver: 'plata', gold: 'oro', sun: 'sol' },
            endings: [['al', 'grove of'], ['ar', 'place of'], ['illa', 'little'], ['ejo', 'little'], ['ena', 'town'], ['era', 'place of'], ['osa', 'rich in'], ['ales', 'groves']],
            starts: [['San ', 'Saint'], ['Santa ', 'Saint'], ['Villa', 'town of'], ['Puerto ', 'harbour of'], ['Castro', 'fort of'], ['Torre', 'tower of'], ['Fuente', 'spring of'], ['Alcalá de ', 'castle of'], ['Medina ', 'city of'], ['Guadal', 'river of']],
        },
        businesses: ['Bar {given}', 'Taberna {word}', 'Casa {family}', 'Café {word}', '{family} e Hijos', 'Bodega {family}'],
    },
    {
        id: 'mexican_spanish', label: 'Mexican Spanish', detect: ['mexico', 'mexican', 'méxico', 'guadalajara', 'monterrey', 'oaxaca', 'yucatán', 'yucatan', 'tijuana'],
        era: 'modern', convention: 'spanish', adjective: ['eño', 'ano'],
        given: {
            m: 'José Juan Luis Miguel Jesús Carlos Francisco Jorge Alejandro Pedro Manuel Antonio Ricardo Fernando Roberto Eduardo Javier Arturo Raúl Sergio Daniel Héctor Óscar Rafael Mario Enrique Martín Gerardo Alberto Ramón Guadalupe Salvador Ignacio Rodrigo Armando Santiago Mateo Sebastián Leonardo Emiliano Diego Iker Gael Matías Tadeo Ximeno Joaquín Rogelio Efraín Porfirio Abelardo Cuauhtémoc',
            f: 'María Guadalupe Juana Margarita Verónica Elizabeth Leticia Rosa Josefina Alejandra Gabriela Patricia Martha Teresa Adriana Silvia Araceli Claudia Laura Yolanda Lucía Norma Isabel Daniela Mariana Fernanda Ximena Valentina Regina Camila Renata Sofía Victoria Natalia Itzel Citlali Xóchitl Paloma Esperanza Dolores Socorro Rocío Consuelo Concepción Luz Marisol Brenda Karla Yesenia Maricela Azucena',
        },
        family: 'Hernández García Martínez López González Pérez Rodríguez Sánchez Ramírez Cruz Flores Gómez Morales Vázquez Reyes Jiménez Torres Díaz Gutiérrez Ruiz Mendoza Aguilar Ortiz Moreno Castillo Romero Álvarez Méndez Chávez Rivera Juárez Ramos Domínguez Herrera Medina Castro Vargas Guzmán Velázquez Muñoz Rojas Contreras Salazar Luna Ortega Santiago Guerrero Estrada Bautista Cortés Soto Alvarado Espinoza Lara Ávila Ríos Cervantes Silva Delgado Vega Márquez Sandoval Fernández León Carrillo Mejía Solís Núñez Rosas Valdez Ibarra Campos Santos Camacho Navarro Peña Maldonado Rosales Acosta Miranda Trejo Valencia Nava Pacheco Robles Molina Rangel Fuentes Huerta Meza Aguirre Cárdenas Orozco Padilla Espinosa Ayala Salas Valenzuela Zúñiga Ochoa Salinas Mora Tapia Durán Galván Calderón',
        places: {
            words: { river: 'río', hill: 'cerro', mountain: 'sierra', valley: 'valle', lake: 'laguna', wood: 'monte', field: 'llano', stone: 'piedra', black: 'negro', white: 'blanco', red: 'colorado', old: 'viejo', new: 'nuevo', holy: 'santo', eagle: 'águila', silver: 'plata', gold: 'oro', snake: 'culebra', cactus: 'nopal' },
            starts: [['San ', 'Saint'], ['Santa ', 'Saint'], ['Villa ', 'town of'], ['Real de ', 'royal mine of'], ['Ciudad ', 'city of'], ['Rancho ', 'ranch of'], ['Hacienda ', 'estate of']],
            endings: [['tepec', 'hill (Nahuatl)'], ['tlán', 'place of (Nahuatl)'], ['co', 'place (Nahuatl)'], ['huacán', 'place of (Nahuatl)'], ['illo', 'little']],
        },
        businesses: ['Taquería {given}', 'Cantina {word}', 'Abarrotes {family}', 'La {noun} {adj}', 'Fonda {given}', 'Panadería {family}'],
    },
    {
        id: 'portuguese', label: 'Portuguese', detect: ['portugal', 'portuguese', 'lisbon', 'lisboa', 'porto', 'algarve'],
        era: 'modern', convention: 'portuguese', adjective: ['ense', 'ano', 'ês'],
        given: {
            m: 'João José António Manuel Francisco Luís Carlos Pedro Paulo Jorge Rui Miguel Fernando Nuno Ricardo Tiago Diogo Duarte Afonso Rodrigo Gonçalo Henrique Martim Santiago Tomás Gustavo Vasco Bernardo Salvador Lourenço Simão Vicente Gaspar Baltasar Fernão Álvaro Bartolomeu Cristóvão Estêvão Gil Hélder Jaime Lucas Marco Mateus Rafael Sebastião Teodoro Vítor Xavier',
            f: 'Maria Ana Joana Inês Beatriz Mariana Leonor Matilde Carolina Sofia Margarida Rita Catarina Teresa Isabel Francisca Madalena Luísa Benedita Constança Clara Filipa Graça Helena Irene Lúcia Marta Patrícia Raquel Sara Susana Vera Alice Aurora Camila Carlota Eva Laura Lara Mafalda Rosa Glória Conceição Fátima Amália Celeste Dulce Esperança Guilhermina',
        },
        prefixes: [['da', 12], ['dos', 6], ['de', 8], ['das', 2]], realPrefixes: true,
        family: 'Silva Santos Ferreira Pereira Oliveira Costa Rodrigues Martins Jesus Sousa Fernandes Gonçalves Gomes Lopes Marques Alves Almeida Ribeiro Pinto Carvalho Teixeira Moreira Correia Mendes Nunes Soares Vieira Monteiro Cardoso Rocha Raposo Neves Coelho Cruz Cunha Pires Ramos Reis Simões Antunes Matos Fonseca Machado Araújo Barbosa Tavares Lourenço Castro Figueiredo Azevedo Freitas Henriques Lima Magalhães Cabral Mota Faria Batista Brito Valente Sá Leite Campos Andrade Dias Baptista Barros Vaz Pacheco Abreu Amaral Pinheiro Sequeira Quintela Brandão Garcia Esteves Macedo Couto Miranda Melo Lobo Branco Vasconcelos',
        places: {
            words: { river: 'rio', hill: 'outeiro', mountain: 'serra', valley: 'vale', lake: 'lagoa', sea: 'mar', wood: 'mata', field: 'campo', stone: 'pedra', ford: 'vau', bridge: 'ponte', island: 'ilha', marsh: 'paul', spring: 'fonte', fort: 'castelo', tower: 'torre', black: 'negro', white: 'branco', red: 'vermelho', green: 'verde', old: 'velho', new: 'novo', high: 'alto', holy: 'santo', iron: 'ferro', wolf: 'lobo', oak: 'carvalho', olive: 'oliveira', gold: 'ouro', salt: 'sal' },
            starts: [['São ', 'Saint'], ['Santa ', 'Saint'], ['Vila ', 'town of'], ['Porto ', 'harbour of'], ['Castelo ', 'castle of'], ['Torre de ', 'tower of'], ['Ponte de ', 'bridge of'], ['Póvoa de ', 'settlement of'], ['Monte ', 'mount']],
            endings: [['inho', 'little'], ['ela', 'little'], ['eira', 'place of'], ['al', 'grove'], ['ães', 'estate of'], ['ido', 'place of']],
        },
        businesses: ['Taberna {word}', 'Café {family}', 'Tasca do {given}', 'Casa {family}', '{family} & Filhos', 'Pastelaria {word}'],
    },
    {
        id: 'brazilian_portuguese', label: 'Brazilian Portuguese', detect: ['brazil', 'brazilian', 'brasil', 'rio de janeiro', 'são paulo', 'sao paulo', 'bahia', 'amazonas', 'recife'],
        era: 'modern', convention: 'portuguese', adjective: ['ense', 'ano'],
        given: {
            m: 'José João Antônio Francisco Carlos Paulo Pedro Lucas Luiz Marcos Luis Gabriel Rafael Daniel Marcelo Bruno Eduardo Felipe Raimundo Rodrigo Manoel Mateus André Fernando Fábio Leonardo Gustavo Guilherme Leandro Tiago Anderson Ricardo Márcio Jorge Sebastião Alexandre Roberto Edson Diego Vitor Sérgio Cláudio Arthur Heitor Bernardo Davi Theo Miguel Enzo Murilo Caio Thiago Wellington Washington Jefferson Adriano Ronaldo',
            f: 'Maria Ana Francisca Antônia Adriana Juliana Márcia Fernanda Patrícia Aline Sandra Camila Amanda Bruna Jéssica Letícia Júlia Luciana Vanessa Mariana Gabriela Vera Larissa Cláudia Beatriz Luana Rita Sônia Renata Eliane Josefa Simone Natália Cristiane Carla Débora Rosângela Jaqueline Rosa Daniela Alice Sophia Helena Valentina Laura Isabella Manuela Heloísa Lorena Lívia Cecília Eloá Yasmin Raissa Thaís',
        },
        prefixes: [['da', 10], ['dos', 6], ['de', 6]], realPrefixes: true,
        family: 'Silva Santos Oliveira Souza Rodrigues Ferreira Alves Pereira Lima Gomes Costa Ribeiro Martins Carvalho Almeida Lopes Soares Fernandes Vieira Barbosa Rocha Dias Nascimento Andrade Moreira Nunes Marques Machado Mendes Freitas Cardoso Ramos Gonçalves Santana Teixeira Araújo Pinto Correia Cavalcanti Moura Monteiro Medeiros Castro Campos Batista Jesus Reis Melo Farias Azevedo Pires Brito Sales Barros Moraes Leite Miranda Bezerra Cunha Tavares Coelho Matos Rezende Guimarães Queiroz Xavier Borges Bastos Sampaio Peixoto Rangel Siqueira Prado Bittencourt Duarte Fonseca Aguiar Magalhães',
        places: {
            words: { river: 'rio', hill: 'morro', mountain: 'serra', valley: 'vale', lake: 'lagoa', sea: 'mar', wood: 'mata', field: 'campo', stone: 'pedra', bridge: 'ponte', island: 'ilha', spring: 'fonte', beach: 'praia', black: 'preto', white: 'branco', red: 'vermelho', green: 'verde', old: 'velho', new: 'novo', high: 'alto', holy: 'santo', jaguar: 'onça', palm: 'palmeira', gold: 'ouro', bird: 'pássaro' },
            starts: [['São ', 'Saint'], ['Santa ', 'Saint'], ['Vila ', 'town of'], ['Porto ', 'harbour of'], ['Morro do ', 'hill of'], ['Praia do ', 'beach of'], ['Nova ', 'new'], ['Bom Jesus do ', 'Good Jesus of']],
            endings: [['inho', 'little'], ['ópolis', 'city'], ['lândia', 'land'], ['ana', 'place'], ['uba', 'place of (Tupi)'], ['tiba', 'abundance of (Tupi)'], ['guaçu', 'great (Tupi)'], ['mirim', 'little (Tupi)']],
        },
        businesses: ['Bar do {given}', 'Boteco {word}', 'Padaria {family}', 'Lanchonete {given}', 'Casa {family}', 'Mercado {word}'],
    },
    {
        id: 'hungarian', label: 'Hungarian', detect: ['hungary', 'hungarian', 'budapest', 'magyar', 'debrecen', 'szeged'],
        era: 'modern', convention: 'family_first', adjective: ['i'],
        given: {
            m: 'László István József János Zoltán Sándor Gábor Ferenc Attila Péter Tibor Lajos Tamás Csaba Imre György Béla Mihály Károly Zsolt Balázs Dávid Bence Máté Levente Ádám Dániel Botond Barnabás Marcell Olivér Zalán Bálint Gergely Kristóf Márk Miklós Ákos Árpád Géza Gyula Kálmán Lőrinc Ödön Pál Szabolcs Tivadar Vilmos Zsigmond Kende Huba Előd Koppány',
            f: 'Mária Erzsébet Katalin Ilona Éva Anna Zsuzsanna Margit Judit Ágnes Andrea Erika Krisztina Julianna Irén Eszter Edit Mónika Gabriella Szilvia Anikó Tímea Hanna Anna Zoé Lili Luca Léna Boglárka Zsófia Laura Emma Jázmin Réka Dorina Viktória Csenge Liliána Kinga Petra Orsolya Hajnalka Enikő Emese Csilla Gizella Piroska Rozália Teréz Vilma Ibolya Tünde',
        },
        family: 'Nagy Kovács Tóth Szabó Horváth Varga Kiss Molnár Németh Farkas Balogh Papp Takács Juhász Lakatos Mészáros Oláh Simon Rácz Fekete Szilágyi Török Fehér Balázs Gál Kis Szűcs Kocsis Orsós Pintér Fodor Szalai Sipos Magyar Lukács Gulyás Biró Király Katona László Jakab Bogdán Balog Sándor Boros Fazekas Kelemen Antal Orosz Somogyi Fülöp Veres Budai Vincze Hegedűs Deák Pap Bálint Pál Illés Vörös Vass Fábián Lengyel Bodnár Szekeres Hajdu Halász Jónás Major Máté Szücs Pásztor Virág Hegyi Barta Csonka Dudás Kozma Bakos Bognár Fejes Medve Csizmadia Erdős Kálmán Héjja',
        oldFamily: 'Árpád Báthory Hunyadi Zrínyi Rákóczi Esterházy Batthyány Károlyi Széchenyi Andrássy Apponyi Bánffy Bethlen Csáky Drugeth Garai Kanizsai Kinizsi Kállay Nádasdy Pálffy Perényi Rozgonyi Szapolyai Telegdi Thurzó Újlaki Wesselényi Forgách Teleki',
        places: {
            words: { river: 'patak', hill: 'domb', mountain: 'hegy', valley: 'völgy', lake: 'tó', sea: 'tenger', wood: 'erdő', field: 'mező', stone: 'kő', ford: 'rév', bridge: 'híd', island: 'sziget', marsh: 'mocsár', spring: 'kút', fort: 'vár', town: 'város', black: 'fekete', white: 'fehér', red: 'vörös', green: 'zöld', old: 'ó', new: 'új', high: 'magas', holy: 'szent', iron: 'vas', wolf: 'farkas', oak: 'tölgy', eagle: 'sas', falcon: 'sólyom', gold: 'arany', silver: 'ezüst', stag: 'szarvas' },
            endings: [['vár', 'castle'], ['falva', 'village'], ['háza', 'house of'], ['egyháza', 'church of'], ['telek', 'holding'], ['hegy', 'hill'], ['völgy', 'valley'], ['kút', 'well'], ['szentmiklós', 'Saint Nicholas'], ['halom', 'mound'], ['laka', 'dwelling of'], ['szállás', 'lodging']],
        },
    },
    {
        id: 'polish', label: 'Polish', detect: ['poland', 'polish', 'warsaw', 'kraków', 'krakow', 'gdańsk', 'gdansk', 'wrocław', 'silesia'],
        era: 'modern', convention: 'slavic', adjective: ['ski', 'an'],
        given: {
            m: 'Piotr Krzysztof Andrzej Tomasz Paweł Jan Michał Marcin Jakub Adam Łukasz Marek Grzegorz Mateusz Wojciech Mariusz Dariusz Zbigniew Jerzy Maciej Rafał Robert Kamil Józef Szymon Antoni Franciszek Aleksander Wiktor Stanisław Kazimierz Bogdan Bolesław Mieczysław Władysław Zdzisław Tadeusz Ryszard Henryk Leszek Witold Bartosz Dominik Filip Hubert Igor Oskar Przemysław Radosław Sławomir Wacław Zygmunt Bronisław',
            f: 'Anna Maria Katarzyna Małgorzata Agnieszka Barbara Ewa Krystyna Magdalena Elżbieta Joanna Aleksandra Monika Zofia Teresa Danuta Natalia Julia Marta Beata Dorota Halina Jadwiga Karolina Hanna Wiktoria Maja Lena Alicja Oliwia Pola Amelia Antonina Helena Laura Nadia Weronika Zuzanna Gabriela Bożena Grażyna Irena Jolanta Kinga Lucyna Mirosława Stanisława Wanda Zuzanna Dobrosława Bogumiła Jagoda',
        },
        family: 'Nowak Kowalski Wiśniewski Wójcik Kowalczyk Kamiński Lewandowski Zieliński Szymański Woźniak Dąbrowski Kozłowski Jankowski Mazur Wojciechowski Kwiatkowski Krawczyk Kaczmarek Piotrowski Grabowski Zając Pawłowski Michalski Król Wieczorek Jabłoński Wróbel Nowakowski Majewski Olszewski Stępień Malinowski Jaworski Adamczyk Dudek Nowicki Pawlak Górski Witkowski Walczak Sikora Baran Rutkowski Michalak Szewczyk Ostrowski Tomaszewski Pietrzak Zalewski Wróblewski Marciniak Jasiński Zawadzki Bąk Jakubowski Sadowski Duda Włodarczyk Wilk Chmielewski Borkowski Sokołowski Szczepański Sawicki Lis Kucharski Kalinowski Wysocki Mazurek Kubiak Kołodziej Czarnecki Sobczak Konieczny Głowacki Zakrzewski Krajewski Sikorski Wasilewski Kozieł Szulc Błaszczyk Andrzejewski Kaczmarczyk',
        oldFamily: 'Radziwiłł Potocki Czartoryski Sapieha Sanguszko Zamoyski Lubomirski Sobieski Wiśniowiecki Ostrogski Tarnowski Leszczyński Opaliński Tęczyński Koniecpolski Ossoliński Pac Chodkiewicz Kiszka Gasztołd Tyszkiewicz Branicki Poniatowski Rzewuski Krasiński Załuski Mniszech Firlej Kmita',
        places: {
            words: { river: 'rzeka', hill: 'góra', mountain: 'góra', valley: 'dolina', lake: 'jezioro', sea: 'morze', wood: 'las', field: 'pole', stone: 'kamień', ford: 'bród', bridge: 'most', island: 'wyspa', marsh: 'bagno', spring: 'źródło', fort: 'gród', black: 'czarny', white: 'biały', red: 'czerwony', green: 'zielony', old: 'stary', new: 'nowy', high: 'wysoki', holy: 'święty', iron: 'żelazo', wolf: 'wilk', oak: 'dąb', birch: 'brzoza', eagle: 'orzeł', bear: 'niedźwiedź', salt: 'sól' },
            endings: [['ów', "someone's"], ['owo', 'place of'], ['ice', "people of"], ['in', "someone's"], ['sko', 'place'], ['niki', 'little'], ['gród', 'town'], ['wola', 'free village'], ['górze', 'on the hill'], ['brzeg', 'shore'], ['las', 'forest'], ['pole', 'field']],
            starts: [['Nowy ', 'new'], ['Stary ', 'old'], ['Biała ', 'white'], ['Czarna ', 'black'], ['Wola ', 'free village'], ['Góra ', 'mount']],
        },
    },
    {
        id: 'russian', label: 'Russian', detect: ['russia', 'russian', 'moscow', 'st petersburg', 'saint petersburg', 'siberia', 'novgorod', 'kiev rus', 'muscovy', 'soviet', 'ussr'],
        era: 'modern', convention: 'russian', adjective: ['sky', 'an'],
        given: {
            m: 'Aleksandr Sergey Dmitry Andrey Aleksey Maksim Yevgeny Ivan Mikhail Artyom Nikolay Vladimir Pavel Igor Roman Denis Viktor Oleg Anton Konstantin Vladislav Kirill Ilya Yuri Vadim Stanislav Vyacheslav Boris Nikita Ruslan Anatoly Valery Gennady Yegor Leonid Pyotr Fyodor Grigory Arkady Gleb Lev Matvey Mark Timofey Yaroslav Svyatoslav Rostislav Bogdan Semyon Stepan Zakhar Vsevolod Platon',
            f: 'Yelena Tatyana Natalya Olga Irina Svetlana Anna Yekaterina Marina Mariya Lyudmila Yuliya Galina Anastasiya Valentina Nadezhda Larisa Lyubov Oksana Tamara Vera Nina Zoya Raisa Darya Kseniya Alina Viktoriya Polina Sofiya Alisa Yeva Varvara Arina Vasilisa Ulyana Milana Taisiya Vlada Kira Yaroslava Lidiya Zinaida Klavdiya Antonina Yevdokiya Praskovya Lyubava Zlata Snezhana',
        },
        family: 'Ivanov Smirnov Kuznetsov Popov Vasiliev Petrov Sokolov Mikhailov Novikov Fyodorov Morozov Volkov Alekseev Lebedev Semyonov Yegorov Pavlov Kozlov Stepanov Nikolaev Orlov Andreev Makarov Nikitin Zakharov Zaytsev Solovyov Borisov Yakovlev Grigoriev Romanov Vorobyov Sergeev Kuzmin Frolov Aleksandrov Dmitriev Korolev Gusev Kiselev Ilyin Maksimov Polyakov Sorokin Vinogradov Kovalev Belov Medvedev Antonov Tarasov Zhukov Baranov Filippov Komarov Davydov Belyaev Gerasimov Bogdanov Osipov Sidorov Matveev Titov Markov Mironov Krylov Kulikov Karpov Vlasov Melnikov Denisov Gavrilov Tikhonov Kazakov Afanasiev Danilov Savelyev Timofeev Fomin Chernov Abramov Martynov Yefimov Fedotov Shcherbakov Nazarov Kalinin Isaev Chernyshev Bykov Maslov Rodionov Konovalov Lazarev Voronin Klimov Filatov Ponomarev Golubev Kudryavtsev Prokhorov Naumov Potapov Zhuravlev Ovchinnikov Trofimov Leonov Sobolev Yermakov Kolesnikov Goncharov Yemelyanov Nikiforov Grachev Kotov Grishin Yefremov Arkhipov Gromov Kirillov Malyshev Panov Moiseev Rumyantsev Akimov Kondratiev Biryukov Gorbunov Anisimov Yeremin Tikhomirov Galkin Lukyanov Mikheev Skvortsov Yudin Belousov Nesterov Simonov Prokofiev Kharitonov Knyazev Tsvetkov Levin Mitrofanov Voronov Aksyonov Sofronov Maltsev Loginov Gorshkov Savin Krasnov Mayorov Demidov Yeliseev Rybakov Safonov Plotnikov Demin Khokhlov Fadeev Molchanov Ignatov Litvinov Yershov Ushakov Dementiev Ryabov Mukhin Kalashnikov Leontiev Lobanov Kuzin Korneev Yevdokimov Borodin Platonov Nekrasov Balashov Bobrov Zhdanov Blinov Ignatiev Korotkov Muravyov Kryukov Belyakov Bogomolov Drozdov Lavrov Zuev Petukhov Larin Nikulin Serov Terentiev Zotov Ustinov Fokin Samoylov Konstantinov Sakharov Shishkin Samsonov Cherkasov Chistyakov Nosov Spiridonov Karasev Avdeev Vorontsov Zverev Vladimirov Seleznev Nechaev Kudryashov Sedov Firsov Andrianov Panin Golovin Terekhov Ulyanov Shestakov Ageev Nikonov Seliverstov Bazhenov Gordeev Kozhevnikov Pakhomov Zimin Kostin Shirokov Filimonov Larionov Ovsyannikov Sazonov Suvorov Nefedov Kornilov Lyubimov Lvov Gorbachev Kopylov Lukin Tokarev Kuleshov Shilov Bolshakov Pankratov Rodin Shapovalov Pokrovsky Bocharov Nikolsky Markin Gorelov Agafonov Berezin Yermolaev Zubkov Kupriyanov Trifonov Maslennikov Kruglov Tretyakov Kolosov Rozhkov Artamonov Shmelev Laptev Lapshin Fyodorov Zimin',
        oldFamily: 'Rurikovich Romanov Golitsyn Trubetskoy Obolensky Dolgorukov Sheremetev Shuisky Godunov Vorotynsky Kurbsky Mstislavsky Odoevsky Pozharsky Repnin Saltykov Volkonsky Vyazemsky Yusupov Bariatinsky Buturlin Kurakin Lopukhin Naryshkin Prozorovsky Shakhovskoy Stroganov Tolstoy Urusov Khovansky',
        places: {
            words: { river: 'reka', hill: 'kholm', mountain: 'gora', valley: 'dolina', lake: 'ozero', sea: 'more', wood: 'les', field: 'pole', stone: 'kamen', ford: 'brod', bridge: 'most', island: 'ostrov', marsh: 'boloto', spring: 'klyuch', fort: 'grad', town: 'gorod', black: 'chyorny', white: 'bely', red: 'krasny', green: 'zelyony', old: 'stary', new: 'novy', high: 'vysoky', holy: 'svyatoy', iron: 'zhelezo', wolf: 'volk', oak: 'dub', birch: 'beryoza', bear: 'medved', eagle: 'oryol', gold: 'zoloto', silver: 'serebro', snow: 'sneg' },
            endings: [['grad', 'city'], ['gorod', 'town'], ['ovo', 'place of'], ['evo', 'place of'], ['ino', 'place of'], ['sk', 'town'], ['ovka', 'village'], ['evka', 'village'], ['ino', 'estate of'], ['skoye', 'village'], ['slavl', 'glory of'], ['pol', 'city']],
            starts: [['Novo', 'new'], ['Staro', 'old'], ['Belo', 'white'], ['Krasno', 'red / beautiful'], ['Chyorno', 'black'], ['Verkhne', 'upper'], ['Nizhne', 'lower'], ['Ust-', 'mouth of'], ['Svyato', 'holy']],
        },
    },
    {
        id: 'ukrainian', label: 'Ukrainian', detect: ['ukraine', 'ukrainian', 'kyiv', 'kiev', 'lviv', 'odesa', 'odessa', 'kharkiv', 'cossack', 'cossacks'],
        era: 'modern', convention: 'russian', patronymSuffix: { m: ['ovych', 'yovych'], f: ['ivna', 'yivna'] }, adjective: ['skyi', 'an'],
        given: {
            m: 'Oleksandr Serhiy Volodymyr Andriy Mykola Oleksiy Dmytro Ivan Yuriy Vasyl Viktor Mykhailo Petro Ihor Vitaliy Roman Bohdan Taras Yaroslav Ostap Maksym Artem Denys Pavlo Stepan Hryhoriy Ivan Anatoliy Valeriy Vadym Ruslan Oleh Borys Fedir Leonid Lev Matviy Nazar Orest Severyn Sviatoslav Myroslav Danylo Zakhar Yevhen Kostiantyn Kyrylo Tymofiy Ilko Marko Omelian',
            f: 'Olena Tetiana Nataliya Iryna Svitlana Oksana Mariya Yuliya Liudmyla Halyna Anna Kateryna Olha Nadiya Valentyna Larysa Lesya Solomiya Daryna Sofiya Anastasiya Viktoriya Khrystyna Zoryana Bohdana Yaroslava Oleksandra Myroslava Uliana Zlata Vira Liubov Ivanna Roksolana Marta Inna Alla Raisa Vasylyna Paraska Hanna Motria Odarka Kvitka Lada Snizhana Stefaniya',
        },
        family: 'Melnyk Shevchenko Kovalenko Bondarenko Boyko Tkachenko Kravchenko Kovalchuk Koval Oliynyk Shevchuk Polishchuk Tkachuk Savchenko Bondar Marchenko Rudenko Moroz Lysenko Petrenko Klymenko Pavlenko Kravchuk Kuzmenko Ponomarenko Savchuk Vasylenko Levchenko Kharchenko Karpenko Havrylyuk Martynyuk Ivanenko Yurchenko Panchenko Hrytsenko Kostenko Sydorenko Didenko Romanenko Zinchenko Mazur Holub Fedorenko Lytvynenko Moskalenko Prykhodko Bilyk Yakovenko Tymoshenko Zhuk Honcharenko Danylyuk Kolesnyk Sych Ostapchuk Hnatyuk Vovk Kozak Sokolenko Chornovil Franko Hrushevsky Skoropadsky Mazepa Khmelnytsky Doroshenko Sahaidachny',
        places: {
            words: { river: 'rika', hill: 'pahorb', mountain: 'hora', valley: 'dolyna', lake: 'ozero', sea: 'more', wood: 'lis', field: 'pole', stone: 'kamin', ford: 'brid', bridge: 'mist', island: 'ostriv', marsh: 'boloto', spring: 'dzherelo', fort: 'horod', black: 'chorny', white: 'bilyi', red: 'chervonyi', green: 'zelenyi', old: 'staryi', new: 'novyi', high: 'vysokyi', holy: 'sviatyi', wolf: 'vovk', oak: 'dub', willow: 'verba', steppe: 'step', cherry: 'vyshnia', sunflower: 'sonyashnyk' },
            endings: [['ivka', 'village'], ['ivtsi', 'people of'], ['horod', 'town'], ['pil', 'city'], ['iv', "someone's"], ['yn', "someone's"], ['ske', 'village'], ['ychi', 'descendants of']],
            starts: [['Novo', 'new'], ['Staro', 'old'], ['Bila ', 'white'], ['Chorno', 'black'], ['Verkhni ', 'upper'], ['Nyzhni ', 'lower']],
        },
    },
];
