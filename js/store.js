/* ============================================
   MaintPro CMMS - Data Store
   LocalStorage-based data management
   ============================================ */

class DataStore {
    constructor() {
        this.STORAGE_KEY = 'maintpro_cmms_data';
        this.data = this.load();
        if (!this.data || !this.data.companies || this.data.companies.length === 0) {
            this.data = this.generateSampleData();
            this.save();
        }
        this.currentCompanyId = this.data.companies[0].id;
    }

    load() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    }

    save() {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.data));
    }

    resetData() {
        this.data = this.generateSampleData();
        this.currentCompanyId = this.data.companies[0].id;
        this.save();
    }

    // ---------- Helpers ----------
    genId() {
        return 'id_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
    }

    today() {
        return new Date().toISOString().split('T')[0];
    }

    dateOffset(days) {
        const d = new Date();
        d.setDate(d.getDate() + days);
        return d.toISOString().split('T')[0];
    }

    // ---------- Companies ----------
    getCompanies() { return this.data.companies; }
    getCompany(id) { return this.data.companies.find(c => c.id === id); }
    getCurrentCompany() { return this.getCompany(this.currentCompanyId); }

    setCurrentCompany(id) {
        this.currentCompanyId = id;
    }

    // ---------- Generic CRUD ----------
    _getCollection(name) {
        return (this.data[name] || []).filter(item => item.companyId === this.currentCompanyId);
    }

    _getAll(name) {
        return this.data[name] || [];
    }

    _getById(name, id) {
        return (this.data[name] || []).find(item => item.id === id);
    }

    _add(name, item) {
        if (!this.data[name]) this.data[name] = [];
        item.id = this.genId();
        item.companyId = this.currentCompanyId;
        item.createdAt = this.today();
        this.data[name].push(item);
        this.save();
        return item;
    }

    _update(name, id, updates) {
        const idx = (this.data[name] || []).findIndex(item => item.id === id);
        if (idx !== -1) {
            Object.assign(this.data[name][idx], updates);
            this.data[name][idx].updatedAt = this.today();
            this.save();
            return this.data[name][idx];
        }
        return null;
    }

    _delete(name, id) {
        this.data[name] = (this.data[name] || []).filter(item => item.id !== id);
        this.save();
    }

    // ---------- Assets ----------
    getAssets() { return this._getCollection('assets'); }
    getAsset(id) { return this._getById('assets', id); }
    addAsset(a) { return this._add('assets', a); }
    updateAsset(id, u) { return this._update('assets', id, u); }
    deleteAsset(id) { this._delete('assets', id); }

    // ---------- Work Orders ----------
    getWorkOrders() { return this._getCollection('workOrders'); }
    getWorkOrder(id) { return this._getById('workOrders', id); }
    addWorkOrder(wo) { return this._add('workOrders', wo); }
    updateWorkOrder(id, u) { return this._update('workOrders', id, u); }
    deleteWorkOrder(id) { this._delete('workOrders', id); }

    // ---------- Preventive Plans ----------
    getPreventivePlans() { return this._getCollection('preventivePlans'); }
    getPreventivePlan(id) { return this._getById('preventivePlans', id); }
    addPreventivePlan(p) { return this._add('preventivePlans', p); }
    updatePreventivePlan(id, u) { return this._update('preventivePlans', id, u); }
    deletePreventivePlan(id) { this._delete('preventivePlans', id); }

    // ---------- Inventory ----------
    getInventory() { return this._getCollection('inventory'); }
    getInventoryItem(id) { return this._getById('inventory', id); }
    addInventoryItem(item) { return this._add('inventory', item); }
    updateInventoryItem(id, u) { return this._update('inventory', id, u); }
    deleteInventoryItem(id) { this._delete('inventory', id); }

    // ---------- Personnel ----------
    getPersonnel() { return this._getCollection('personnel'); }
    getPersonnelById(id) { return this._getById('personnel', id); }
    addPersonnel(p) { return this._add('personnel', p); }
    updatePersonnel(id, u) { return this._update('personnel', id, u); }
    deletePersonnel(id) { this._delete('personnel', id); }

    // ---------- Activity Log ----------
    addLog(entry) {
        if (!this.data.activityLog) this.data.activityLog = [];
        this.data.activityLog.unshift({
            id: this.genId(),
            companyId: this.currentCompanyId,
            timestamp: new Date().toISOString(),
            ...entry
        });
        if (this.data.activityLog.length > 500) this.data.activityLog = this.data.activityLog.slice(0, 500);
        this.save();
    }

    getRecentLogs(limit = 10) {
        return (this.data.activityLog || [])
            .filter(l => l.companyId === this.currentCompanyId)
            .slice(0, limit);
    }

    // ---------- KPIs ----------
    getKPIs() {
        const assets = this.getAssets();
        const wos = this.getWorkOrders();
        const plans = this.getPreventivePlans();
        const inventory = this.getInventory();

        const completed = wos.filter(w => w.status === 'completada');
        const pending = wos.filter(w => w.status === 'pendiente');
        const inProgress = wos.filter(w => w.status === 'en_progreso');

        // MTTR - Mean Time To Repair (hours)
        let mttr = 0;
        if (completed.length > 0) {
            const totalHours = completed.reduce((s, w) => s + (parseFloat(w.actualHours) || parseFloat(w.estimatedHours) || 2), 0);
            mttr = (totalHours / completed.length).toFixed(1);
        }

        // MTBF - Mean Time Between Failures (days)
        const correctiveCompleted = completed.filter(w => w.type === 'correctivo');
        let mtbf = assets.length > 0 ? Math.round(365 / Math.max(correctiveCompleted.length, 1)) : 0;

        // Availability
        const totalPossibleHours = assets.length * 720; // 30 days * 24 hours
        const downtime = wos.reduce((s, w) => s + (parseFloat(w.actualHours) || parseFloat(w.estimatedHours) || 0), 0);
        const availability = totalPossibleHours > 0 ? (((totalPossibleHours - downtime) / totalPossibleHours) * 100).toFixed(1) : 100;

        // Low stock items
        const lowStock = inventory.filter(i => parseFloat(i.quantity) <= parseFloat(i.minStock));

        // Overdue PMs
        const today = this.today();
        const overduePlans = plans.filter(p => p.nextExecution && p.nextExecution < today && p.status === 'activo');

        return {
            totalAssets: assets.length,
            activeAssets: assets.filter(a => a.status === 'operativo').length,
            totalWOs: wos.length,
            pendingWOs: pending.length,
            inProgressWOs: inProgress.length,
            completedWOs: completed.length,
            cancelledWOs: wos.filter(w => w.status === 'cancelada').length,
            mttr: parseFloat(mttr),
            mtbf,
            availability: parseFloat(availability),
            lowStockCount: lowStock.length,
            overduePMs: overduePlans.length,
            totalPlans: plans.length,
            activePlans: plans.filter(p => p.status === 'activo').length,
            totalPersonnel: this.getPersonnel().length,
            woByType: {
                correctivo: wos.filter(w => w.type === 'correctivo').length,
                preventivo: wos.filter(w => w.type === 'preventivo').length,
                predictivo: wos.filter(w => w.type === 'predictivo').length,
                mejora: wos.filter(w => w.type === 'mejora').length,
            },
            woByPriority: {
                critica: wos.filter(w => w.priority === 'critica').length,
                alta: wos.filter(w => w.priority === 'alta').length,
                media: wos.filter(w => w.priority === 'media').length,
                baja: wos.filter(w => w.priority === 'baja').length,
            }
        };
    }

    // ---------- Sample Data Generation ----------
    generateSampleData() {
        const data = { companies: [], assets: [], workOrders: [], preventivePlans: [], inventory: [], personnel: [], activityLog: [] };

        // Companies
        data.companies = [
            { id: 'comp_01', name: 'PetroAndina S.A.', industry: 'Petróleo y Gas', rut: '900.123.456-7', address: 'Km 7 Vía Barrancabermeja, Santander', contact: 'Carlos Mendoza', email: 'cmendoza@petroandina.co', phone: '(607) 620-1234' },
            { id: 'comp_02', name: 'AgroVerde Ltda.', industry: 'Agroindustria', rut: '800.987.654-3', address: 'Vereda La Esperanza, Yopal, Casanare', contact: 'María Fernanda López', email: 'mflopez@agroverde.co', phone: '(608) 635-5678' },
            { id: 'comp_03', name: 'MetalPrecision S.A.S.', industry: 'Manufactura', rut: '901.456.789-1', address: 'Zona Industrial de Mamonal, Cartagena', contact: 'Roberto Vargas', email: 'rvargas@metalprecision.co', phone: '(605) 668-9012' }
        ];

        // ---- PetroAndina Assets ----
        const petroAssets = [
            { id: 'ast_p01', companyId: 'comp_01', name: 'Bomba Centrífuga PC-001', code: 'BOM-PC-001', category: 'Bombas', location: 'Estación de Bombeo Norte', brand: 'Sulzer', model: 'CPT 50-300', serial: 'SLZ-2022-78456', installDate: '2022-03-15', status: 'operativo', criticality: 'alta', parentId: null, specs: 'Caudal: 300 m³/h, Presión: 15 bar, Potencia: 250 HP' },
            { id: 'ast_p02', companyId: 'comp_01', name: 'Compresor de Gas CG-001', code: 'COM-CG-001', category: 'Compresores', location: 'Planta de Gas', brand: 'Atlas Copco', model: 'GA 160', serial: 'AC-2021-34521', installDate: '2021-06-20', status: 'operativo', criticality: 'alta', parentId: null, specs: 'Capacidad: 160 kW, Presión: 13 bar, Tipo: Tornillo' },
            { id: 'ast_p03', companyId: 'comp_01', name: 'Separador Trifásico ST-001', code: 'SEP-ST-001', category: 'Separadores', location: 'Batería de Producción A', brand: 'National Oilwell', model: 'TPS-3000', serial: 'NO-2020-11234', installDate: '2020-01-10', status: 'operativo', criticality: 'alta', parentId: null, specs: 'Capacidad: 3000 bpd, Presión: 300 psi' },
            { id: 'ast_p04', companyId: 'comp_01', name: 'Motor Eléctrico ME-003', code: 'MOT-ME-003', category: 'Motores', location: 'Estación de Bombeo Norte', brand: 'WEG', model: 'W22 355M/L', serial: 'WEG-2022-89012', installDate: '2022-03-15', status: 'operativo', criticality: 'media', parentId: 'ast_p01', specs: 'Potencia: 250 HP, 460V, 60Hz, 1785 RPM' },
            { id: 'ast_p05', companyId: 'comp_01', name: 'Válvula de Control VC-012', code: 'VAL-VC-012', category: 'Válvulas', location: 'Línea de Flujo Principal', brand: 'Fisher', model: 'EZ 667', serial: 'FSH-2023-45678', installDate: '2023-08-05', status: 'operativo', criticality: 'media', parentId: null, specs: 'Diámetro: 6", Tipo: Globo, Actuador neumático' },
            { id: 'ast_p06', companyId: 'comp_01', name: 'Generador Diésel GD-002', code: 'GEN-GD-002', category: 'Generadores', location: 'Subestación Eléctrica', brand: 'Caterpillar', model: 'C18', serial: 'CAT-2019-67890', installDate: '2019-11-22', status: 'en_mantenimiento', criticality: 'alta', parentId: null, specs: 'Potencia: 600 kW, Diésel, Arranque automático' },
            { id: 'ast_p07', companyId: 'comp_01', name: 'Transformador TR-001', code: 'TRF-TR-001', category: 'Eléctrico', location: 'Subestación Eléctrica', brand: 'ABB', model: 'RESIBLOC', serial: 'ABB-2020-12345', installDate: '2020-05-18', status: 'operativo', criticality: 'alta', parentId: null, specs: '13.2kV / 460V, 1000 kVA, Tipo seco' },
            { id: 'ast_p08', companyId: 'comp_01', name: 'Intercambiador de Calor IC-001', code: 'INT-IC-001', category: 'Intercambiadores', location: 'Planta de Tratamiento', brand: 'Alfa Laval', model: 'T20', serial: 'AL-2021-78901', installDate: '2021-09-12', status: 'fuera_de_servicio', criticality: 'media', parentId: null, specs: 'Tipo: Placas, Área: 50 m², Material: Acero Inox 316' }
        ];

        // ---- AgroVerde Assets ----
        const agroAssets = [
            { id: 'ast_a01', companyId: 'comp_02', name: 'Tractor John Deere 6150M', code: 'TRC-JD-001', category: 'Maquinaria Agrícola', location: 'Finca El Porvenir', brand: 'John Deere', model: '6150M', serial: 'JD-2023-56789', installDate: '2023-02-10', status: 'operativo', criticality: 'alta', parentId: null, specs: 'Potencia: 150 HP, Motor: 6 cilindros, Transmisión PowerQuad' },
            { id: 'ast_a02', companyId: 'comp_02', name: 'Sistema de Riego Pivot SR-001', code: 'RIE-SR-001', category: 'Sistemas de Riego', location: 'Lote 5 - Finca El Porvenir', brand: 'Valley', model: '8000 Series', serial: 'VLY-2022-34567', installDate: '2022-07-15', status: 'operativo', criticality: 'alta', parentId: null, specs: 'Cobertura: 50 hectáreas, 7 tramos, GPS integrado' },
            { id: 'ast_a03', companyId: 'comp_02', name: 'Secadora de Arroz SA-001', code: 'SEC-SA-001', category: 'Procesamiento', location: 'Planta de Secado', brand: 'Kepler Weber', model: 'KW 200', serial: 'KW-2021-89012', installDate: '2021-04-20', status: 'operativo', criticality: 'alta', parentId: null, specs: 'Capacidad: 200 ton/día, Combustible: Gas Natural' },
            { id: 'ast_a04', companyId: 'comp_02', name: 'Cosechadora Combinada CC-001', code: 'COS-CC-001', category: 'Maquinaria Agrícola', location: 'Parqueadero de Maquinaria', brand: 'New Holland', model: 'CR 7.90', serial: 'NH-2022-12345', installDate: '2022-11-05', status: 'operativo', criticality: 'alta', parentId: null, specs: 'Ancho de corte: 9m, Motor: 374 HP, Tolva: 10500 L' },
            { id: 'ast_a05', companyId: 'comp_02', name: 'Bomba de Riego BR-003', code: 'BOM-BR-003', category: 'Bombas', location: 'Estación de Bombeo Río', brand: 'Pedrollo', model: 'HF 32B', serial: 'PDR-2023-67890', installDate: '2023-06-12', status: 'operativo', criticality: 'media', parentId: null, specs: 'Caudal: 800 L/min, Altura: 25m, Motor: 15 HP' },
            { id: 'ast_a06', companyId: 'comp_02', name: 'Planta Eléctrica PE-001', code: 'GEN-PE-001', category: 'Generadores', location: 'Finca El Porvenir', brand: 'Cummins', model: 'C150D5', serial: 'CMN-2020-45678', installDate: '2020-08-30', status: 'en_mantenimiento', criticality: 'media', parentId: null, specs: 'Potencia: 150 kW, Diésel, Arranque automático' }
        ];

        // ---- MetalPrecision Assets ----
        const metalAssets = [
            { id: 'ast_m01', companyId: 'comp_03', name: 'Torno CNC Haas TL-2', code: 'TOR-CNC-001', category: 'Mecanizado', location: 'Nave 1 - Mecanizado', brand: 'Haas', model: 'TL-2', serial: 'HAAS-2022-11111', installDate: '2022-01-15', status: 'operativo', criticality: 'alta', parentId: null, specs: 'Volteo: 406mm, Largo: 864mm, Husillo: 20 HP, 4000 RPM' },
            { id: 'ast_m02', companyId: 'comp_03', name: 'Fresadora CNC VMC-750', code: 'FRE-CNC-001', category: 'Mecanizado', location: 'Nave 1 - Mecanizado', brand: 'Haas', model: 'VF-3', serial: 'HAAS-2021-22222', installDate: '2021-05-20', status: 'operativo', criticality: 'alta', parentId: null, specs: 'Recorrido X:1016mm Y:508mm Z:635mm, 30 HP' },
            { id: 'ast_m03', companyId: 'comp_03', name: 'Soldadora MIG Lincoln', code: 'SOL-MIG-001', category: 'Soldadura', location: 'Nave 2 - Soldadura', brand: 'Lincoln Electric', model: 'Power MIG 360MP', serial: 'LE-2023-33333', installDate: '2023-03-01', status: 'operativo', criticality: 'media', parentId: null, specs: 'Corriente: 360A, Voltaje: 208/230/460V, Multiproceso' },
            { id: 'ast_m04', companyId: 'comp_03', name: 'Prensa Hidráulica PH-001', code: 'PRE-PH-001', category: 'Conformado', location: 'Nave 3 - Conformado', brand: 'DAKE', model: '150H', serial: 'DK-2020-44444', installDate: '2020-09-10', status: 'operativo', criticality: 'media', parentId: null, specs: 'Capacidad: 150 ton, Carrera: 300mm, Motor: 20 HP' },
            { id: 'ast_m05', companyId: 'comp_03', name: 'Compresor Industrial CI-001', code: 'COM-CI-001', category: 'Compresores', location: 'Cuarto de Compresores', brand: 'Ingersoll Rand', model: 'R110', serial: 'IR-2021-55555', installDate: '2021-07-25', status: 'operativo', criticality: 'alta', parentId: null, specs: 'Potencia: 110 kW, Caudal: 19.5 m³/min, 8 bar' },
            { id: 'ast_m06', companyId: 'comp_03', name: 'Puente Grúa PG-001', code: 'GRU-PG-001', category: 'Izaje', location: 'Nave 1 - Mecanizado', brand: 'Konecranes', model: 'CXT', serial: 'KC-2019-66666', installDate: '2019-12-01', status: 'operativo', criticality: 'alta', parentId: null, specs: 'Capacidad: 10 ton, Luz: 15m, Altura: 8m' },
            { id: 'ast_m07', companyId: 'comp_03', name: 'Horno de Tratamiento HT-001', code: 'HOR-HT-001', category: 'Tratamiento Térmico', location: 'Nave 4 - Tratamientos', brand: 'Nabertherm', model: 'N 500/85HA', serial: 'NB-2022-77777', installDate: '2022-04-18', status: 'fuera_de_servicio', criticality: 'media', parentId: null, specs: 'Temp max: 850°C, Volumen: 500L, Atmósfera controlada' }
        ];

        data.assets = [...petroAssets, ...agroAssets, ...metalAssets];

        // ---- Work Orders ----
        const woStatuses = ['pendiente', 'en_progreso', 'completada', 'cancelada'];
        const woPriorities = ['critica', 'alta', 'media', 'baja'];
        const woTypes = ['correctivo', 'preventivo', 'predictivo', 'mejora'];

        data.workOrders = [
            // PetroAndina WOs
            { id: 'wo_p01', companyId: 'comp_01', assetId: 'ast_p01', type: 'correctivo', priority: 'alta', status: 'en_progreso', description: 'Fuga en sello mecánico de bomba centrífuga. Se detectó goteo constante durante inspección de rutina.', assignedTo: 'per_p01', createdDate: this.dateOffset(-3), startDate: this.dateOffset(-2), completedDate: null, estimatedHours: '8', actualHours: '', spareParts: 'Sello mecánico, empaque, aceite lubricante', notes: 'Se requiere parada de bomba para intervención' },
            { id: 'wo_p02', companyId: 'comp_01', assetId: 'ast_p02', type: 'preventivo', priority: 'media', status: 'pendiente', description: 'Cambio de filtros de aire y aceite del compresor. Mantenimiento programado cada 4000 horas.', assignedTo: 'per_p02', createdDate: this.dateOffset(-1), startDate: null, completedDate: null, estimatedHours: '4', actualHours: '', spareParts: 'Filtro de aire, filtro de aceite, aceite sintético', notes: 'Horas actuales: 3950' },
            { id: 'wo_p03', companyId: 'comp_01', assetId: 'ast_p06', type: 'correctivo', priority: 'critica', status: 'en_progreso', description: 'Generador diésel no arranca. Se sospecha fallo en sistema de inyección de combustible.', assignedTo: 'per_p01', createdDate: this.dateOffset(-1), startDate: this.dateOffset(-1), completedDate: null, estimatedHours: '12', actualHours: '', spareParts: 'Inyectores, filtro de combustible', notes: 'Urgente - es generador de respaldo principal' },
            { id: 'wo_p04', companyId: 'comp_01', assetId: 'ast_p05', type: 'predictivo', priority: 'baja', status: 'completada', description: 'Análisis de vibraciones en válvula de control. Resultados dentro de parámetros normales.', assignedTo: 'per_p03', createdDate: this.dateOffset(-15), startDate: this.dateOffset(-14), completedDate: this.dateOffset(-14), estimatedHours: '2', actualHours: '1.5', spareParts: '', notes: 'Próximo análisis en 90 días' },
            { id: 'wo_p05', companyId: 'comp_01', assetId: 'ast_p08', type: 'correctivo', priority: 'alta', status: 'completada', description: 'Intercambiador de calor con baja eficiencia térmica. Se realizó limpieza química de placas.', assignedTo: 'per_p02', createdDate: this.dateOffset(-20), startDate: this.dateOffset(-19), completedDate: this.dateOffset(-17), estimatedHours: '16', actualHours: '18', spareParts: 'Solución limpiadora, empaques nuevos', notes: 'Se recomienda reemplazo de 5 placas en próximo mantenimiento' },
            { id: 'wo_p06', companyId: 'comp_01', assetId: 'ast_p07', type: 'preventivo', priority: 'media', status: 'completada', description: 'Inspección termográfica de transformador. Verificación de conexiones y nivel de aceite.', assignedTo: 'per_p03', createdDate: this.dateOffset(-30), startDate: this.dateOffset(-29), completedDate: this.dateOffset(-29), estimatedHours: '3', actualHours: '2.5', spareParts: '', notes: 'Sin novedades. Temperatura dentro de rango.' },
            { id: 'wo_p07', companyId: 'comp_01', assetId: 'ast_p03', type: 'mejora', priority: 'baja', status: 'pendiente', description: 'Instalación de sensores IoT en separador trifásico para monitoreo remoto de nivel y presión.', assignedTo: 'per_p03', createdDate: this.dateOffset(-5), startDate: null, completedDate: null, estimatedHours: '24', actualHours: '', spareParts: 'Sensores de presión, transmisor de nivel, gateway IoT', notes: 'Proyecto de mejora aprobado por gerencia' },

            // AgroVerde WOs
            { id: 'wo_a01', companyId: 'comp_02', assetId: 'ast_a01', type: 'preventivo', priority: 'media', status: 'pendiente', description: 'Servicio de mantenimiento a 500 horas. Cambio de aceite motor, filtros y revisión general.', assignedTo: 'per_a01', createdDate: this.dateOffset(-2), startDate: null, completedDate: null, estimatedHours: '6', actualHours: '', spareParts: 'Aceite motor 15W-40 x 20L, kit de filtros', notes: 'Horómetro actual: 485 horas' },
            { id: 'wo_a02', companyId: 'comp_02', assetId: 'ast_a02', type: 'correctivo', priority: 'alta', status: 'en_progreso', description: 'Fallo en motor del tramo 4 del sistema pivot. No gira correctamente, se escucha ruido metálico.', assignedTo: 'per_a02', createdDate: this.dateOffset(-1), startDate: this.dateOffset(-1), completedDate: null, estimatedHours: '8', actualHours: '', spareParts: 'Motor de tramo, reductor', notes: 'Cultivo de arroz en etapa crítica de riego' },
            { id: 'wo_a03', companyId: 'comp_02', assetId: 'ast_a03', type: 'preventivo', priority: 'media', status: 'completada', description: 'Limpieza y calibración de quemador principal de secadora. Verificación de termocuplas.', assignedTo: 'per_a01', createdDate: this.dateOffset(-10), startDate: this.dateOffset(-9), completedDate: this.dateOffset(-8), estimatedHours: '5', actualHours: '4', spareParts: 'Termocupla tipo K, bujía de encendido', notes: 'Listo para temporada de cosecha' },
            { id: 'wo_a04', companyId: 'comp_02', assetId: 'ast_a06', type: 'correctivo', priority: 'media', status: 'en_progreso', description: 'Planta eléctrica con alto consumo de combustible y humo negro. Requiere revisión de inyección.', assignedTo: 'per_a02', createdDate: this.dateOffset(-4), startDate: this.dateOffset(-3), completedDate: null, estimatedHours: '10', actualHours: '', spareParts: 'Kit de inyectores, filtro de aire', notes: '' },

            // MetalPrecision WOs
            { id: 'wo_m01', companyId: 'comp_03', assetId: 'ast_m01', type: 'preventivo', priority: 'alta', status: 'pendiente', description: 'Mantenimiento semestral de torno CNC. Verificación de geometría, cambio de aceite de guías y husillo.', assignedTo: 'per_m01', createdDate: this.dateOffset(-2), startDate: null, completedDate: null, estimatedHours: '8', actualHours: '', spareParts: 'Aceite de guías ISO 68, aceite hidráulico', notes: 'Programar para fin de semana' },
            { id: 'wo_m02', companyId: 'comp_03', assetId: 'ast_m02', type: 'correctivo', priority: 'critica', status: 'en_progreso', description: 'Alarma de overtravel en eje Y de fresadora CNC. Posible fallo en encoder del servomotor.', assignedTo: 'per_m01', createdDate: this.dateOffset(-1), startDate: this.dateOffset(-1), completedDate: null, estimatedHours: '6', actualHours: '', spareParts: 'Encoder, cable de encoder', notes: 'Máquina detenida - producción afectada' },
            { id: 'wo_m03', companyId: 'comp_03', assetId: 'ast_m05', type: 'predictivo', priority: 'media', status: 'completada', description: 'Análisis de aceite del compresor. Medición de partículas, viscosidad y contenido de agua.', assignedTo: 'per_m02', createdDate: this.dateOffset(-12), startDate: this.dateOffset(-11), completedDate: this.dateOffset(-11), estimatedHours: '2', actualHours: '1.5', spareParts: '', notes: 'Aceite en buen estado. Próximo análisis en 3 meses.' },
            { id: 'wo_m04', companyId: 'comp_03', assetId: 'ast_m07', type: 'correctivo', priority: 'alta', status: 'completada', description: 'Reemplazo de resistencias calefactoras del horno de tratamiento térmico. 3 de 12 resistencias quemadas.', assignedTo: 'per_m02', createdDate: this.dateOffset(-25), startDate: this.dateOffset(-24), completedDate: this.dateOffset(-22), estimatedHours: '12', actualHours: '14', spareParts: 'Resistencias calefactoras x3, contactores', notes: 'Equipo fuera de servicio hasta nuevo aviso por evaluación de más daños' },
            { id: 'wo_m05', companyId: 'comp_03', assetId: 'ast_m06', type: 'preventivo', priority: 'media', status: 'completada', description: 'Inspección anual de puente grúa. Verificación de cables, frenos, limitadores y prueba de carga.', assignedTo: 'per_m03', createdDate: this.dateOffset(-35), startDate: this.dateOffset(-34), completedDate: this.dateOffset(-33), estimatedHours: '8', actualHours: '7', spareParts: '', notes: 'Certificación emitida. Válida hasta marzo 2027.' }
        ];

        // ---- Preventive Plans ----
        data.preventivePlans = [
            { id: 'pm_p01', companyId: 'comp_01', assetId: 'ast_p01', name: 'Inspección semanal de bomba', frequency: '7', frequencyUnit: 'días', lastExecution: this.dateOffset(-8), nextExecution: this.dateOffset(-1), tasks: 'Verificar presión de succión y descarga|Inspeccionar sellos mecánicos|Medir vibración|Verificar temperatura de rodamientos|Revisar nivel de aceite', assignedTo: 'per_p01', estimatedHours: '1', status: 'activo' },
            { id: 'pm_p02', companyId: 'comp_01', assetId: 'ast_p02', name: 'Mantenimiento 4000h de compresor', frequency: '4000', frequencyUnit: 'horas', lastExecution: this.dateOffset(-120), nextExecution: this.dateOffset(5), tasks: 'Cambio de aceite sintético|Cambio de filtros de aire|Cambio de filtros de aceite|Inspección de válvulas|Limpieza de radiador|Verificación de presión', assignedTo: 'per_p02', estimatedHours: '6', status: 'activo' },
            { id: 'pm_p03', companyId: 'comp_01', assetId: 'ast_p07', name: 'Inspección trimestral de transformador', frequency: '90', frequencyUnit: 'días', lastExecution: this.dateOffset(-29), nextExecution: this.dateOffset(61), tasks: 'Termografía de conexiones|Medición de resistencia de aislamiento|Verificación de nivel de aceite|Limpieza de boquillas', assignedTo: 'per_p03', estimatedHours: '3', status: 'activo' },

            { id: 'pm_a01', companyId: 'comp_02', assetId: 'ast_a01', name: 'Servicio 250h de tractor', frequency: '250', frequencyUnit: 'horas', lastExecution: this.dateOffset(-60), nextExecution: this.dateOffset(2), tasks: 'Cambio de aceite motor|Cambio de filtros|Engrase general|Revisión de neumáticos|Verificar niveles de fluidos', assignedTo: 'per_a01', estimatedHours: '4', status: 'activo' },
            { id: 'pm_a02', companyId: 'comp_02', assetId: 'ast_a02', name: 'Revisión mensual de pivot', frequency: '30', frequencyUnit: 'días', lastExecution: this.dateOffset(-35), nextExecution: this.dateOffset(-5), tasks: 'Verificar alineación de tramos|Inspeccionar aspersores|Revisar presión de agua|Verificar motores de tramo|Lubricar pivotes', assignedTo: 'per_a02', estimatedHours: '3', status: 'activo' },

            { id: 'pm_m01', companyId: 'comp_03', assetId: 'ast_m01', name: 'Mantenimiento semestral de torno CNC', frequency: '180', frequencyUnit: 'días', lastExecution: this.dateOffset(-180), nextExecution: this.dateOffset(0), tasks: 'Verificación de geometría|Nivelación de bancada|Cambio de aceite de guías|Cambio de aceite hidráulico|Limpieza de filtros de refrigerante|Verificación de herramientas', assignedTo: 'per_m01', estimatedHours: '8', status: 'activo' },
            { id: 'pm_m02', companyId: 'comp_03', assetId: 'ast_m05', name: 'Análisis de aceite trimestral', frequency: '90', frequencyUnit: 'días', lastExecution: this.dateOffset(-11), nextExecution: this.dateOffset(79), tasks: 'Toma de muestra de aceite|Envío a laboratorio|Análisis de resultados|Documentar hallazgos', assignedTo: 'per_m02', estimatedHours: '2', status: 'activo' }
        ];

        // ---- Inventory ----
        data.inventory = [
            // PetroAndina
            { id: 'inv_p01', companyId: 'comp_01', name: 'Sello mecánico Sulzer 50mm', code: 'REP-SM-001', category: 'Sellos', unit: 'und', quantity: '3', minStock: '2', maxStock: '8', unitCost: '450000', location: 'Almacén Central - A1', supplier: 'Sulzer Colombia' },
            { id: 'inv_p02', companyId: 'comp_01', name: 'Filtro de aceite Atlas Copco', code: 'REP-FA-001', category: 'Filtros', unit: 'und', quantity: '8', minStock: '4', maxStock: '15', unitCost: '185000', location: 'Almacén Central - B2', supplier: 'Atlas Copco Service' },
            { id: 'inv_p03', companyId: 'comp_01', name: 'Aceite sintético PAO 46 x 20L', code: 'LUB-AS-001', category: 'Lubricantes', unit: 'caneca', quantity: '2', minStock: '3', maxStock: '10', unitCost: '780000', location: 'Almacén de Lubricantes', supplier: 'Mobil Colombia' },
            { id: 'inv_p04', companyId: 'comp_01', name: 'Rodamiento SKF 22328', code: 'REP-RD-001', category: 'Rodamientos', unit: 'und', quantity: '4', minStock: '2', maxStock: '6', unitCost: '890000', location: 'Almacén Central - C1', supplier: 'SKF Colombia' },
            { id: 'inv_p05', companyId: 'comp_01', name: 'Inyector Caterpillar C18', code: 'REP-IN-001', category: 'Inyección', unit: 'und', quantity: '1', minStock: '2', maxStock: '6', unitCost: '1250000', location: 'Almacén Central - D3', supplier: 'Caterpillar (GECOLSA)' },

            // AgroVerde
            { id: 'inv_a01', companyId: 'comp_02', name: 'Aceite motor 15W-40 x 20L', code: 'LUB-AM-001', category: 'Lubricantes', unit: 'caneca', quantity: '5', minStock: '3', maxStock: '12', unitCost: '320000', location: 'Bodega de Insumos', supplier: 'Terpel Lubricantes' },
            { id: 'inv_a02', companyId: 'comp_02', name: 'Kit de filtros John Deere 6150M', code: 'REP-KF-001', category: 'Filtros', unit: 'kit', quantity: '2', minStock: '2', maxStock: '6', unitCost: '280000', location: 'Bodega de Insumos', supplier: 'DERCO - John Deere' },
            { id: 'inv_a03', companyId: 'comp_02', name: 'Motor de tramo Valley', code: 'REP-MT-001', category: 'Motores', unit: 'und', quantity: '1', minStock: '1', maxStock: '3', unitCost: '2800000', location: 'Bodega de Insumos', supplier: 'Valley Irrigation' },
            { id: 'inv_a04', companyId: 'comp_02', name: 'Termocupla tipo K', code: 'REP-TK-001', category: 'Instrumentación', unit: 'und', quantity: '6', minStock: '3', maxStock: '10', unitCost: '45000', location: 'Bodega de Insumos', supplier: 'Instrumentos y Controles' },

            // MetalPrecision
            { id: 'inv_m01', companyId: 'comp_03', name: 'Aceite de guías ISO 68 x 20L', code: 'LUB-AG-001', category: 'Lubricantes', unit: 'caneca', quantity: '3', minStock: '2', maxStock: '8', unitCost: '425000', location: 'Almacén Técnico - L1', supplier: 'Shell Lubricantes' },
            { id: 'inv_m02', companyId: 'comp_03', name: 'Encoder incremental Fanuc', code: 'REP-EN-001', category: 'Electrónica', unit: 'und', quantity: '1', minStock: '1', maxStock: '3', unitCost: '3200000', location: 'Almacén Técnico - E1', supplier: 'Fanuc México' },
            { id: 'inv_m03', companyId: 'comp_03', name: 'Resistencia calefactora 2kW', code: 'REP-RC-001', category: 'Calefacción', unit: 'und', quantity: '4', minStock: '3', maxStock: '10', unitCost: '180000', location: 'Almacén Técnico - H1', supplier: 'Resistencias Industriales' },
            { id: 'inv_m04', companyId: 'comp_03', name: 'Refrigerante soluble x 20L', code: 'LUB-RF-001', category: 'Refrigerantes', unit: 'caneca', quantity: '6', minStock: '2', maxStock: '10', unitCost: '210000', location: 'Almacén Técnico - L2', supplier: 'Castrol Industrial' },
            { id: 'inv_m05', companyId: 'comp_03', name: 'Cable de acero 3/8" para grúa', code: 'REP-CA-001', category: 'Cables', unit: 'metro', quantity: '50', minStock: '20', maxStock: '100', unitCost: '18000', location: 'Almacén Técnico - G1', supplier: 'Cables Industriales' }
        ];

        // ---- Personnel ----
        data.personnel = [
            // PetroAndina
            { id: 'per_p01', companyId: 'comp_01', name: 'Juan Carlos Herrera', role: 'Técnico Mecánico', specialization: 'Equipos Rotativos', email: 'jherrera@petroandina.co', phone: '310-456-7890', status: 'activo', shift: 'Diurno (6am-6pm)' },
            { id: 'per_p02', companyId: 'comp_01', name: 'Andrés Felipe Ruiz', role: 'Técnico Mecánico', specialization: 'Compresores y Bombas', email: 'aruiz@petroandina.co', phone: '311-234-5678', status: 'activo', shift: 'Diurno (6am-6pm)' },
            { id: 'per_p03', companyId: 'comp_01', name: 'Diana Marcela Torres', role: 'Ingeniera de Confiabilidad', specialization: 'Análisis Predictivo', email: 'dtorres@petroandina.co', phone: '315-678-9012', status: 'activo', shift: 'Administrativo (8am-5pm)' },
            { id: 'per_p04', companyId: 'comp_01', name: 'Pedro Alonso Díaz', role: 'Técnico Electricista', specialization: 'Alta y Media Tensión', email: 'pdiaz@petroandina.co', phone: '312-345-6789', status: 'activo', shift: 'Nocturno (6pm-6am)' },

            // AgroVerde
            { id: 'per_a01', companyId: 'comp_02', name: 'Miguel Ángel Parra', role: 'Técnico de Maquinaria', specialization: 'Motores Diésel', email: 'mparra@agroverde.co', phone: '313-456-7890', status: 'activo', shift: 'Diurno (6am-4pm)' },
            { id: 'per_a02', companyId: 'comp_02', name: 'Fabián Enrique Castro', role: 'Técnico Electromecánico', specialization: 'Sistemas de Riego', email: 'fcastro@agroverde.co', phone: '314-567-8901', status: 'activo', shift: 'Diurno (6am-4pm)' },
            { id: 'per_a03', companyId: 'comp_02', name: 'Sandra Patricia Muñoz', role: 'Supervisora de Mantenimiento', specialization: 'Gestión de Activos', email: 'smunoz@agroverde.co', phone: '316-789-0123', status: 'activo', shift: 'Administrativo (7am-4pm)' },

            // MetalPrecision
            { id: 'per_m01', companyId: 'comp_03', name: 'Ricardo José Ospina', role: 'Técnico CNC', specialization: 'Máquinas Herramienta CNC', email: 'rospina@metalprecision.co', phone: '317-890-1234', status: 'activo', shift: 'Diurno (7am-5pm)' },
            { id: 'per_m02', companyId: 'comp_03', name: 'Leonardo Fabio Mejía', role: 'Técnico de Mantenimiento', specialization: 'Sistemas Hidráulicos', email: 'lmejia@metalprecision.co', phone: '318-901-2345', status: 'activo', shift: 'Diurno (7am-5pm)' },
            { id: 'per_m03', companyId: 'comp_03', name: 'Camila Andrea Restrepo', role: 'Ingeniera de Mantenimiento', specialization: 'Planificación y Confiabilidad', email: 'crestrepo@metalprecision.co', phone: '319-012-3456', status: 'activo', shift: 'Administrativo (8am-5pm)' }
        ];

        // ---- Activity Log ----
        data.activityLog = [
            { id: 'log_01', companyId: 'comp_01', timestamp: new Date(Date.now() - 3600000).toISOString(), action: 'wo_created', message: 'OT creada: Fuga en sello mecánico', user: 'Sistema' },
            { id: 'log_02', companyId: 'comp_01', timestamp: new Date(Date.now() - 7200000).toISOString(), action: 'wo_started', message: 'OT iniciada: Generador diésel no arranca', user: 'J. Herrera' },
            { id: 'log_03', companyId: 'comp_01', timestamp: new Date(Date.now() - 86400000).toISOString(), action: 'wo_completed', message: 'OT completada: Análisis de vibraciones en válvula', user: 'D. Torres' },
            { id: 'log_04', companyId: 'comp_02', timestamp: new Date(Date.now() - 3600000).toISOString(), action: 'wo_created', message: 'OT creada: Fallo en motor del tramo 4 de pivot', user: 'Sistema' },
            { id: 'log_05', companyId: 'comp_03', timestamp: new Date(Date.now() - 7200000).toISOString(), action: 'wo_started', message: 'OT iniciada: Alarma overtravel en fresadora CNC', user: 'R. Ospina' },
        ];

        return data;
    }
}

// Global store instance
const store = new DataStore();
